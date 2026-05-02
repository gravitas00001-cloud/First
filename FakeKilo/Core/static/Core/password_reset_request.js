document.addEventListener("DOMContentLoaded", () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const form = document.getElementById("passwordResetRequestForm");
    const feedback = document.getElementById("passwordResetRequestFeedback");
    const submitButton = document.getElementById("passwordResetRequestSubmitButton");

    function setButtonBusy(busy) {
        submitButton.disabled = busy;
        submitButton.textContent = busy ? "Sending reset link..." : "Send reset link";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        app.hideFeedback(feedback);
        setButtonBusy(true);

        try {
            const formData = new FormData(form);
            const data = await app.request(config.urls.requestPasswordReset, {
                method: "POST",
                body: {
                    email: String(formData.get("email") || "").trim(),
                },
            });

            app.showFeedback(feedback, data.message, "success");
            form.reset();
        } catch (error) {
            app.showFeedback(feedback, error.message, "error");
        } finally {
            setButtonBusy(false);
        }
    });
});
