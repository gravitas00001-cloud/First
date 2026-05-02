document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const loginView = document.getElementById("loginView");
    const signupView = document.getElementById("signupView");
    const loginTabButton = document.getElementById("loginTabButton");
    const signupTabButton = document.getElementById("signupTabButton");
    const googleAuthButton = document.getElementById("googleAuthButton");
    const googleHelperText = document.getElementById("googleHelperText");
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const loginFeedback = document.getElementById("loginFeedback");
    const signupFeedback = document.getElementById("signupFeedback");
    const loginSubmitButton = document.getElementById("loginSubmitButton");
    const signupSubmitButton = document.getElementById("signupSubmitButton");
    let codeClient = null;
    let redirectCodeClient = null;

    if (await app.redirectToDashboardIfAuthenticated()) {
        return;
    }

    function setActiveMode(mode) {
        const loginMode = mode === "login";

        loginTabButton.classList.toggle("is-active", loginMode);
        signupTabButton.classList.toggle("is-active", !loginMode);
        loginView.classList.toggle("is-active", loginMode);
        signupView.classList.toggle("is-active", !loginMode);
        loginView.hidden = !loginMode;
        signupView.hidden = loginMode;
    }

    function setButtonBusy(button, busy, idleLabel, busyLabel) {
        button.disabled = busy;
        button.textContent = busy ? busyLabel : idleLabel;
    }

    async function handleLogin(event) {
        event.preventDefault();
        app.hideFeedback(loginFeedback);
        setButtonBusy(loginSubmitButton, true, "Open dashboard", "Opening dashboard...");

        try {
            const formData = new FormData(loginForm);
            const data = await app.request(config.urls.tokenObtainPair, {
                method: "POST",
                body: {
                    email: String(formData.get("email") || "").trim(),
                    password: String(formData.get("password") || ""),
                },
            });

            app.setSession(data);
            await app.fetchCurrentUser();
            window.location.assign(config.urls.dashboard);
        } catch (error) {
            const message = error.data && error.data.detail === "No active account found with the given credentials"
                ? "Invalid email or password."
                : error.message;
            app.showFeedback(loginFeedback, message, "error");
        } finally {
            setButtonBusy(loginSubmitButton, false, "Open dashboard", "Opening dashboard...");
        }
    }

    async function handleSignup(event) {
        event.preventDefault();
        app.hideFeedback(signupFeedback);

        try {
            const formData = new FormData(signupForm);
            const payload = {
                first_name: String(formData.get("first_name") || "").trim(),
                last_name: String(formData.get("last_name") || "").trim(),
                email: String(formData.get("email") || "").trim(),
                password: String(formData.get("password") || ""),
            };
            const passwordConfirm = String(formData.get("password_confirm") || "");

            if (payload.password !== passwordConfirm) {
                app.showFeedback(signupFeedback, "Passwords do not match.", "error");
                return;
            }

            setButtonBusy(signupSubmitButton, true, "Send verification code", "Sending code...");

            const data = await app.request(config.urls.requestSignupOtp, {
                method: "POST",
                body: payload,
            });

            app.setPendingSignup({
                email: data.email,
                first_name: payload.first_name,
                last_name: payload.last_name,
                requested_at: new Date().toISOString(),
                expires_in_minutes: data.expires_in_minutes,
            });

            window.location.assign(`${config.urls.verify}?email=${encodeURIComponent(data.email)}`);
        } catch (error) {
            app.showFeedback(signupFeedback, error.message, "error");
        } finally {
            setButtonBusy(signupSubmitButton, false, "Send verification code", "Sending code...");
        }
    }

    async function exchangeGoogleCode(code) {
        setButtonBusy(googleAuthButton, true, "Continue with Google", "Connecting to Google...");

        try {
            const formData = new FormData();
            formData.append("code", code);

            const data = await app.request(config.urls.googleLogin, {
                method: "POST",
                body: formData,
            });

            app.setSession(data.tokens, data.user);
            app.clearPendingSignup();
            window.location.assign(config.urls.dashboard);
        } catch (error) {
            app.showFeedback(loginFeedback, error.message, "error");
        } finally {
            setButtonBusy(googleAuthButton, false, "Continue with Google", "Connecting to Google...");
        }
    }

    async function handleGoogleCode(response) {
        app.hideFeedback(loginFeedback);
        console.info("Google OAuth callback received", response);

        if (!response || !response.code) {
            const message = response && response.error
                ? `Google sign-in failed: ${response.error}`
                : "Google did not return an authorization code.";
            console.error("Google OAuth did not return a usable code", response);
            app.showFeedback(loginFeedback, message, "error");
            return;
        }

        await exchangeGoogleCode(response.code);
    }

    async function handleRedirectCodeFromUrl() {
        const currentUrl = new URL(window.location.href);
        const code = currentUrl.searchParams.get("code");
        const error = currentUrl.searchParams.get("error");

        if (!code && !error) {
            return false;
        }

        currentUrl.searchParams.delete("code");
        currentUrl.searchParams.delete("scope");
        currentUrl.searchParams.delete("authuser");
        currentUrl.searchParams.delete("prompt");
        currentUrl.searchParams.delete("error");
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        }

        if (error) {
            console.error("Google redirect flow returned an error", error);
            app.showFeedback(loginFeedback, `Google sign-in failed: ${error}`, "error");
            return true;
        }

        await exchangeGoogleCode(code);
        return true;
    }

    function startRedirectGoogleAuth() {
        if (!redirectCodeClient) {
            app.showFeedback(loginFeedback, "Google sign-in fallback is not ready yet. Please refresh and try again.", "error");
            return;
        }

        app.showFeedback(loginFeedback, "Switching to full-page Google sign-in...", "success");
        redirectCodeClient.requestCode();
    }

    function handleGooglePopupError(error) {
        console.error("Google OAuth popup error", error);

        let message = "Google sign-in could not be completed. Please try again.";
        if (error && error.type === "popup_failed_to_open") {
            message = "The Google sign-in popup was blocked by your browser. Allow popups and try again.";
        } else if (error && error.type === "popup_closed") {
            message = "The Google sign-in popup could not finish. Switching to a full-page Google sign-in flow.";
        } else if (error && error.type) {
            message = `Google sign-in failed: ${error.type}`;
        }

        app.showFeedback(loginFeedback, message, error && error.type === "popup_closed" ? "success" : "error");

        if (error && error.type === "popup_closed") {
            window.setTimeout(() => {
                startRedirectGoogleAuth();
            }, 250);
        }
    }

    function initializeGoogleAuth() {
        if (!config.googleClientId) {
            googleAuthButton.disabled = true;
            googleHelperText.textContent = "Google sign-in is unavailable until GOOGLE_OAUTH_CLIENT_ID is configured.";
            return;
        }

        let attempts = 0;

        function tryBoot() {
            if (window.google && window.google.accounts && window.google.accounts.oauth2) {
                codeClient = window.google.accounts.oauth2.initCodeClient({
                    client_id: config.googleClientId,
                    scope: "openid email profile",
                    ux_mode: "popup",
                    select_account: true,
                    callback: handleGoogleCode,
                    error_callback: handleGooglePopupError,
                });
                redirectCodeClient = window.google.accounts.oauth2.initCodeClient({
                    client_id: config.googleClientId,
                    scope: "openid email profile",
                    ux_mode: "redirect",
                    redirect_uri: window.location.origin + window.location.pathname,
                });
                googleAuthButton.disabled = false;
                googleHelperText.textContent = "Google sign-in is ready and will route successful users to the dashboard.";
                return;
            }

            attempts += 1;
            if (attempts >= 25) {
                googleAuthButton.disabled = true;
                googleHelperText.textContent = "Google sign-in could not load. Refresh and try again.";
                return;
            }

            window.setTimeout(tryBoot, 200);
        }

        googleAuthButton.disabled = true;
        googleHelperText.textContent = "Preparing Google sign-in...";
        tryBoot();
    }

    loginTabButton.addEventListener("click", () => setActiveMode("login"));
    signupTabButton.addEventListener("click", () => setActiveMode("signup"));
    loginForm.addEventListener("submit", handleLogin);
    signupForm.addEventListener("submit", handleSignup);
    googleAuthButton.addEventListener("click", () => {
        app.hideFeedback(loginFeedback);

        if (!codeClient) {
            app.showFeedback(loginFeedback, "Google sign-in is still loading. Try again in a moment.", "error");
            return;
        }

        try {
            codeClient.requestCode();
        } catch (error) {
            console.error("Google sign-in popup request failed", error);
            startRedirectGoogleAuth();
        }
    });

    if (await handleRedirectCodeFromUrl()) {
        return;
    }

    initializeGoogleAuth();
    setActiveMode("login");
});
