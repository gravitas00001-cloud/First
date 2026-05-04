(function () {
    const configElement = document.getElementById("fake-kilo-config");
    const config = configElement ? JSON.parse(configElement.textContent) : { urls: {} };
    const storageKeys = {
        accessToken: "fakekilo.accessToken",
        refreshToken: "fakekilo.refreshToken",
        user: "fakekilo.user",
        pendingSignup: "fakekilo.pendingSignup",
        pendingPasswordReset: "fakekilo.pendingPasswordReset",
        verifiedPasswordReset: "fakekilo.verifiedPasswordReset",
    };

    class ApiError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = "ApiError";
            this.status = options.status || 0;
            this.data = options.data || null;
        }
    }

    function safeJsonParse(value, fallback = null) {
        try {
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function getAccessToken() {
        return window.localStorage.getItem(storageKeys.accessToken);
    }

    function getRefreshToken() {
        return window.localStorage.getItem(storageKeys.refreshToken);
    }

    function setStoredUser(user) {
        if (!user) {
            return;
        }

        window.localStorage.setItem(storageKeys.user, JSON.stringify(user));
    }

    function getStoredUser() {
        return safeJsonParse(window.localStorage.getItem(storageKeys.user));
    }

    function setSession(tokens, user) {
        if (tokens && tokens.access) {
            window.localStorage.setItem(storageKeys.accessToken, tokens.access);
        }

        if (tokens && tokens.refresh) {
            window.localStorage.setItem(storageKeys.refreshToken, tokens.refresh);
        }

        if (user) {
            setStoredUser(user);
        }
    }

    function clearSession() {
        window.localStorage.removeItem(storageKeys.accessToken);
        window.localStorage.removeItem(storageKeys.refreshToken);
        window.localStorage.removeItem(storageKeys.user);
    }

    function getPendingSignup() {
        return safeJsonParse(window.sessionStorage.getItem(storageKeys.pendingSignup));
    }

    function setPendingSignup(payload) {
        window.sessionStorage.setItem(storageKeys.pendingSignup, JSON.stringify(payload));
    }

    function clearPendingSignup() {
        window.sessionStorage.removeItem(storageKeys.pendingSignup);
    }

    function getPendingPasswordReset() {
        return safeJsonParse(window.sessionStorage.getItem(storageKeys.pendingPasswordReset));
    }

    function setPendingPasswordReset(payload) {
        window.sessionStorage.setItem(storageKeys.pendingPasswordReset, JSON.stringify(payload));
    }

    function clearPendingPasswordReset() {
        window.sessionStorage.removeItem(storageKeys.pendingPasswordReset);
    }

    function getVerifiedPasswordReset() {
        return safeJsonParse(window.sessionStorage.getItem(storageKeys.verifiedPasswordReset));
    }

    function setVerifiedPasswordReset(payload) {
        window.sessionStorage.setItem(storageKeys.verifiedPasswordReset, JSON.stringify(payload));
    }

    function clearVerifiedPasswordReset() {
        window.sessionStorage.removeItem(storageKeys.verifiedPasswordReset);
    }

    function getAuthHeaders(initialHeaders = {}) {
        const headers = new Headers(initialHeaders);
        const accessToken = getAccessToken();

        headers.set("X-Requested-With", "XmlHttpRequest");
        if (accessToken) {
            headers.set("Authorization", `Bearer ${accessToken}`);
        }

        return headers;
    }

    function extractErrorMessage(data, fallback = "Something went wrong.") {
        if (!data) {
            return fallback;
        }

        if (typeof data === "string") {
            return data;
        }

        if (typeof data.error === "string") {
            return data.error;
        }

        if (typeof data.detail === "string") {
            return data.detail;
        }

        if (data.errors && typeof data.errors === "object") {
            const firstKey = Object.keys(data.errors)[0];
            if (firstKey) {
                const value = data.errors[firstKey];
                if (Array.isArray(value)) {
                    return value[0];
                }
                if (typeof value === "string") {
                    return value;
                }
            }
        }

        return fallback;
    }

    async function parseResponse(response) {
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            return response.json();
        }

        const text = await response.text();
        return text ? { detail: text } : {};
    }

    async function request(url, options = {}) {
        const init = {
            method: options.method || "GET",
            headers: new Headers(options.headers || {}),
        };

        if (!init.headers.has("X-Requested-With")) {
            init.headers.set("X-Requested-With", "XmlHttpRequest");
        }

        if (options.body !== undefined && options.body !== null) {
            if (options.body instanceof FormData) {
                init.body = options.body;
            } else if (typeof options.body === "string") {
                init.body = options.body;
            } else {
                init.headers.set("Content-Type", "application/json");
                init.body = JSON.stringify(options.body);
            }
        }

        const response = await fetch(url, init);
        const data = await parseResponse(response);

        if (!response.ok) {
            throw new ApiError(
                extractErrorMessage(data, `Request failed with status ${response.status}.`),
                {
                    status: response.status,
                    data,
                }
            );
        }

        return data;
    }

    async function refreshAccessToken() {
        const refreshToken = getRefreshToken();

        if (!refreshToken) {
            throw new ApiError("Your session has ended. Please sign in again.", { status: 401 });
        }

        const data = await request(config.urls.tokenRefresh, {
            method: "POST",
            body: { refresh: refreshToken },
        });

        if (!data.access) {
            throw new ApiError("Could not refresh your session.", { status: 401, data });
        }

        window.localStorage.setItem(storageKeys.accessToken, data.access);
        return data.access;
    }

    async function fetchCurrentUser(options = {}) {
        const allowRefresh = options.allowRefresh !== false;

        try {
            const data = await request(config.urls.currentUser, {
                headers: getAuthHeaders(),
            });
            if (data.user) {
                setStoredUser(data.user);
            }
            return data.user || null;
        } catch (error) {
            if (allowRefresh && error.status === 401 && getRefreshToken()) {
                await refreshAccessToken();
                return fetchCurrentUser({ allowRefresh: false });
            }
            throw error;
        }
    }

    async function redirectToDashboardIfAuthenticated() {
        if (!getAccessToken() && !getRefreshToken()) {
            return false;
        }

        try {
            await fetchCurrentUser();
            window.location.assign(config.urls.dashboard);
            return true;
        } catch (error) {
            clearSession();
            return false;
        }
    }

    function getDisplayName(user) {
        if (!user) {
            return config.appName || "there";
        }

        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
        return fullName || user.email || config.appName || "there";
    }

    function decodeJwt(token) {
        try {
            const tokenParts = token.split(".");
            if (tokenParts.length < 2) {
                return null;
            }

            const payload = tokenParts[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/");
            const decoded = window.atob(payload);
            return JSON.parse(decoded);
        } catch (error) {
            return null;
        }
    }

    function getAccessTokenExpiry() {
        const payload = decodeJwt(getAccessToken() || "");
        return payload && payload.exp ? payload.exp * 1000 : null;
    }

    function showFeedback(element, message, tone = "default") {
        if (!element) {
            return;
        }

        element.hidden = false;
        element.textContent = message;
        element.classList.remove("is-error", "is-success");

        if (tone === "error") {
            element.classList.add("is-error");
        }

        if (tone === "success") {
            element.classList.add("is-success");
        }
    }

    function hideFeedback(element) {
        if (!element) {
            return;
        }

        element.hidden = true;
        element.textContent = "";
        element.classList.remove("is-error", "is-success");
    }

    window.FakeKiloApp = {
        ApiError,
        clearPendingSignup,
        clearPendingPasswordReset,
        clearSession,
        clearVerifiedPasswordReset,
        config,
        decodeJwt,
        extractErrorMessage,
        fetchCurrentUser,
        getAccessToken,
        getAccessTokenExpiry,
        getDisplayName,
        getPendingSignup,
        getPendingPasswordReset,
        getRefreshToken,
        getStoredUser,
        getVerifiedPasswordReset,
        hideFeedback,
        redirectToDashboardIfAuthenticated,
        request,
        refreshAccessToken,
        setPendingSignup,
        setPendingPasswordReset,
        setSession,
        setVerifiedPasswordReset,
        showFeedback,
        storageKeys,
    };
})();
