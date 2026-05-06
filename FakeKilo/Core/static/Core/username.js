document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const form = document.getElementById("completeProfileForm");
    const feedback = document.getElementById("completeProfileFeedback");
    const submitButton = document.getElementById("completeProfileSubmitButton");
    const usernameInput = form ? form.elements.namedItem("username") : null;

    function redirectHome() {
        app.clearSession();
        app.clearPendingSignup();
        window.location.assign(config.urls.home);
    }

    function setButtonBusy(busy) {
        submitButton.disabled = busy;
        submitButton.textContent = busy ? "Saving..." : "Save username";
    }

    try {
        const user = await app.fetchCurrentUser();

        if (!app.requiresUsername(user)) {
            window.location.assign(config.urls.dashboard);
            return;
        }

        if (usernameInput && user.username) {
            usernameInput.value = user.username;
        }
    } catch (error) {
        redirectHome();
        return;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        app.hideFeedback(feedback);
        setButtonBusy(true);

        try {
            const data = await app.request(config.urls.updateUsername, {
                method: "POST",
                headers: new Headers({
                    Authorization: `Bearer ${app.getAccessToken()}`,
                    "X-Requested-With": "XmlHttpRequest",
                }),
                body: {
                    username: String(usernameInput.value || "").trim(),
                },
            });

            if (data.user) {
                app.setSession({}, data.user);
            }

            window.location.assign(config.urls.dashboard);
        } catch (error) {
            if (error.status === 401 && app.getRefreshToken()) {
                try {
                    await app.refreshAccessToken();
                    const data = await app.request(config.urls.updateUsername, {
                        method: "POST",
                        headers: new Headers({
                            Authorization: `Bearer ${app.getAccessToken()}`,
                            "X-Requested-With": "XmlHttpRequest",
                        }),
                        body: {
                            username: String(usernameInput.value || "").trim(),
                        },
                    });

                    if (data.user) {
                        app.setSession({}, data.user);
                    }

                    window.location.assign(config.urls.dashboard);
                    return;
                } catch (retryError) {
                    app.showFeedback(feedback, retryError.message, "error");
                }
            } else {
                app.showFeedback(feedback, error.message, "error");
            }
        } finally {
            setButtonBusy(false);
        }
    });
});
