document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const dashboardGreeting = document.getElementById("dashboardGreeting");
    const dashboardSubtitle = document.getElementById("dashboardSubtitle");
    const dashboardNotice = document.getElementById("dashboardNotice");
    const dashboardUserName = document.getElementById("dashboardUserName");
    const dashboardUsername = document.getElementById("dashboardUsername");
    const dashboardEmail = document.getElementById("dashboardEmail");
    const dashboardRegistrationMethod = document.getElementById("dashboardRegistrationMethod");
    const dashboardStatusBadge = document.getElementById("dashboardStatusBadge");
    const dashboardSessionState = document.getElementById("dashboardSessionState");
    const dashboardExpiryTime = document.getElementById("dashboardExpiryTime");
    const dashboardSessionHint = document.getElementById("dashboardSessionHint");
    const dashboardHighlights = document.getElementById("dashboardHighlights");
    const refreshSessionButton = document.getElementById("refreshSessionButton");
    const signOutButton = document.getElementById("signOutButton");

    function redirectHome() {
        app.clearSession();
        app.clearPendingSignup();
        window.location.assign(config.urls.home);
    }

    function formatMethod(method) {
        if (method === "google") {
            return "Google";
        }

        if (method === "email") {
            return "Email and password";
        }

        return "Unknown";
    }

    function formatExpiry(timestamp) {
        if (!timestamp) {
            return "Unknown";
        }

        const expiryDate = new Date(timestamp);
        const now = Date.now();

        if (expiryDate.getTime() <= now) {
            return "Expired";
        }

        return expiryDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function renderDashboard(user) {
        const displayName = app.getDisplayName(user);
        const expiryTimestamp = app.getAccessTokenExpiry();
        const refreshAvailable = Boolean(app.getRefreshToken());

        dashboardGreeting.textContent = `Welcome, ${displayName}.`;
        dashboardSubtitle.textContent = "Your session is active and the protected dashboard is ready.";
        dashboardUserName.textContent = displayName;
        dashboardUsername.textContent = user.username || "Not set";
        dashboardEmail.textContent = user.email;
        dashboardRegistrationMethod.textContent = formatMethod(user.registration_method);
        dashboardStatusBadge.textContent = "Authenticated";
        dashboardSessionState.textContent = refreshAvailable ? "Ready" : "Limited";
        dashboardExpiryTime.textContent = formatExpiry(expiryTimestamp);
        dashboardSessionHint.textContent = refreshAvailable
            ? "A refresh token is present, so the client can renew access when needed."
            : "Only an access token is present, so you may need to sign in again when it expires.";

        dashboardHighlights.innerHTML = "";
        [
            `${formatMethod(user.registration_method)} login completed successfully.`,
            `${user.email} is available to authenticated client requests.`,
            "Redirects now send signed-in users straight to this dashboard.",
        ].forEach((item) => {
            const listItem = document.createElement("li");
            listItem.textContent = item;
            dashboardHighlights.appendChild(listItem);
        });
    }

    async function loadDashboard(showSuccessMessage = false) {
        try {
            const user = await app.fetchCurrentUser();
            if (app.requiresUsername(user)) {
                window.location.assign(config.urls.completeProfile);
                return;
            }
            renderDashboard(user);
            if (showSuccessMessage) {
                app.showFeedback(dashboardNotice, "Session refreshed successfully.", "success");
            } else {
                app.hideFeedback(dashboardNotice);
            }
        } catch (error) {
            redirectHome();
        }
    }

    refreshSessionButton.addEventListener("click", async () => {
        refreshSessionButton.disabled = true;
        refreshSessionButton.textContent = "Refreshing...";

        try {
            await app.refreshAccessToken();
            await loadDashboard(true);
        } catch (error) {
            redirectHome();
        } finally {
            refreshSessionButton.disabled = false;
            refreshSessionButton.textContent = "Refresh session";
        }
    });

    signOutButton.addEventListener("click", () => {
        redirectHome();
    });

    await loadDashboard();
});
