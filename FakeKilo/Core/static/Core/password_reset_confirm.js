document.addEventListener("DOMContentLoaded", () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const form = document.getElementById("passwordResetConfirmForm");
    const feedback = document.getElementById("passwordResetConfirmFeedback");
    const submitButton = document.getElementById("passwordResetConfirmSubmitButton");
    const card = document.querySelector("[data-reset-uid][data-reset-token]");
    const uid = card ? String(card.dataset.resetUid || "").trim() : "";
    const token = card ? String(card.dataset.resetToken || "").trim() : "";

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

        if (!uid || !token) {
            app.showFeedback(feedback, "This password reset link is invalid or incomplete.", "error");
            return;
        }

        setButtonBusy(true);

        try {
            const data = await app.request(config.urls.confirmPasswordReset, {
                method: "POST",
                body: {
                    uid,
                    token,
                    password,
                },
            });

            app.clearSession();
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
