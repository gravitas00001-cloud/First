document.addEventListener("DOMContentLoaded", () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const form = document.getElementById("passwordResetConfirmForm");
    const feedback = document.getElementById("passwordResetConfirmFeedback");
    const submitButton = document.getElementById("passwordResetConfirmSubmitButton");
    const verifiedPasswordReset = app.getVerifiedPasswordReset();

    function setButtonBusy(busy) {
        submitButton.disabled = busy;
        submitButton.textContent = busy ? "Updating password..." : "Update password";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        app.hideFeedback(feedback);

        const formData = new FormData(form);
        const password = String(formData.get("password") || "");
        const passwordConfirm = String(formData.get("password_confirm") || "");

        if (password !== passwordConfirm) {
            app.showFeedback(feedback, "The password confirmation does not match.", "error");
            return;
        }

        if (!verifiedPasswordReset || !verifiedPasswordReset.email || !verifiedPasswordReset.reset_token) {
            app.showFeedback(feedback, "Your password reset session is missing or expired. Request a new code.", "error");
            window.setTimeout(() => {
                window.location.assign(config.urls.passwordResetRequestPage);
            }, 1200);
            return;
        }

        setButtonBusy(true);

        try {
            const data = await app.request(config.urls.confirmPasswordReset, {
                method: "POST",
                body: {
                    email: verifiedPasswordReset.email,
                    reset_token: verifiedPasswordReset.reset_token,
                    password,
                },
            });

            app.clearSession();
            app.clearPendingPasswordReset();
            app.clearVerifiedPasswordReset();
            app.showFeedback(feedback, data.message, "success");
            form.reset();
            window.setTimeout(() => {
                window.location.assign(config.urls.home);
            }, 1200);
        } catch (error) {
            app.showFeedback(feedback, error.message, "error");
        } finally {
            setButtonBusy(false);
        }
    });
});
