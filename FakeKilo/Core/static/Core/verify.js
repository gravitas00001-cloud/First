document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const emailLabel = document.getElementById("pendingSignupEmail");
    const otpCodeInput = document.getElementById("otpCodeInput");
    const verifyOtpForm = document.getElementById("verifyOtpForm");
    const verifyFeedback = document.getElementById("verifyFeedback");
    const verifySubmitButton = document.getElementById("verifySubmitButton");
    const resendOtpButton = document.getElementById("resendOtpButton");
    const queryEmail = new URLSearchParams(window.location.search).get("email");
    let pendingSignup = app.getPendingSignup();
    let countdownTimer = null;

    if (await app.redirectToDashboardIfAuthenticated()) {
        return;
    }

    if (!pendingSignup && queryEmail) {
        pendingSignup = { email: queryEmail };
        app.setPendingSignup(pendingSignup);
    }

    if (!pendingSignup || !pendingSignup.email) {
        window.location.assign(config.urls.home);
        return;
    }

    emailLabel.textContent = pendingSignup.email;

    function setButtonBusy(button, busy, idleLabel, busyLabel) {
        button.disabled = busy;
        button.textContent = busy ? busyLabel : idleLabel;
    }

    function startResendCountdown(seconds) {
        const totalSeconds = Math.max(Number(seconds) || config.signupOtpResendCooldownSeconds, 1);
        let remaining = totalSeconds;

        window.clearInterval(countdownTimer);
        resendOtpButton.disabled = true;
        resendOtpButton.textContent = `Resend in ${remaining}s`;

        countdownTimer = window.setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                window.clearInterval(countdownTimer);
                resendOtpButton.disabled = false;
                resendOtpButton.textContent = "Resend code";
                return;
            }

            resendOtpButton.textContent = `Resend in ${remaining}s`;
        }, 1000);
    }

    function getRemainingCooldownSeconds() {
        if (!pendingSignup || !pendingSignup.requested_at) {
            return 0;
        }

        const requestedAt = new Date(pendingSignup.requested_at).getTime();
        if (!requestedAt) {
            return 0;
        }

        const elapsedSeconds = Math.floor((Date.now() - requestedAt) / 1000);
        return Math.max(config.signupOtpResendCooldownSeconds - elapsedSeconds, 0);
    }

    async function handleVerify(event) {
        event.preventDefault();
        app.hideFeedback(verifyFeedback);
        setButtonBusy(verifySubmitButton, true, "Verify and continue", "Verifying...");

        try {
            const data = await app.request(config.urls.verifySignupOtp, {
                method: "POST",
                body: {
                    email: pendingSignup.email,
                    otp: String(otpCodeInput.value || "").trim(),
                },
            });

            app.setSession(data.tokens, data.user);
            app.clearPendingSignup();
            window.location.assign(config.urls.dashboard);
        } catch (error) {
            if (error.data && error.data.retry_after) {
                startResendCountdown(error.data.retry_after);
            }

            app.showFeedback(verifyFeedback, error.message, "error");
        } finally {
            setButtonBusy(verifySubmitButton, false, "Verify and continue", "Verifying...");
        }
    }

    async function handleResend() {
        app.hideFeedback(verifyFeedback);
        setButtonBusy(resendOtpButton, true, "Resend code", "Sending...");

        try {
            const data = await app.request(config.urls.resendSignupOtp, {
                method: "POST",
                body: { email: pendingSignup.email },
            });

            pendingSignup = {
                ...pendingSignup,
                requested_at: new Date().toISOString(),
                expires_in_minutes: data.expires_in_minutes,
            };
            app.setPendingSignup(pendingSignup);
            app.showFeedback(verifyFeedback, data.message, "success");
            startResendCountdown(config.signupOtpResendCooldownSeconds);
        } catch (error) {
            if (error.data && error.data.retry_after) {
                app.showFeedback(verifyFeedback, error.message, "error");
                startResendCountdown(error.data.retry_after);
                return;
            }

            app.showFeedback(verifyFeedback, error.message, "error");
            resendOtpButton.disabled = false;
            resendOtpButton.textContent = "Resend code";
        }
    }

    otpCodeInput.addEventListener("input", () => {
        otpCodeInput.value = otpCodeInput.value.replace(/\D/g, "").slice(0, config.signupOtpLength);
    });

    verifyOtpForm.addEventListener("submit", handleVerify);
    resendOtpButton.addEventListener("click", handleResend);

    const remainingCooldown = getRemainingCooldownSeconds();
    if (remainingCooldown > 0) {
        startResendCountdown(remainingCooldown);
    }
});
