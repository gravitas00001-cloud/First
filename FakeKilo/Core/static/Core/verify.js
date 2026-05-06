document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const emailLabel = document.getElementById("pendingSignupEmail");
    const otpCodeInput = document.getElementById("otpCodeInput");
    const verifyOtpForm = document.getElementById("verifyOtpForm");
    const verifyFeedback = document.getElementById("verifyFeedback");
    const verifySubmitButton = document.getElementById("verifySubmitButton");
    const resendOtpButton = document.getElementById("resendOtpButton");
    const otpExpiryTimer = document.getElementById("signupOtpExpiryTimer");
    const queryEmail = new URLSearchParams(window.location.search).get("email");
    let pendingSignup = app.getPendingSignup();
    let countdownTimer = null;
    let expiryTimer = null;

    if (await app.redirectToDashboardIfAuthenticated()) {
        return;
    }

    if (!pendingSignup && queryEmail) {
        pendingSignup = {
            email: queryEmail,
            requested_at: new Date().toISOString(),
            expires_in_minutes: config.signupOtpExpiryMinutes,
        };
        app.setPendingSignup(pendingSignup);
    }

    if (!pendingSignup || !pendingSignup.email) {
        window.location.assign(config.urls.home);
        return;
    }

    emailLabel.textContent = app.maskEmailAddress(pendingSignup.email);

    function setButtonBusy(button, busy, idleLabel, busyLabel) {
        button.disabled = busy;
        button.textContent = busy ? busyLabel : idleLabel;
    }

    function formatClock(totalSeconds) {
        const safeSeconds = Math.max(Number(totalSeconds) || 0, 0);
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function getOtpExpiryWindowSeconds() {
        const expiryMinutes = Number(
            pendingSignup && pendingSignup.expires_in_minutes
                ? pendingSignup.expires_in_minutes
                : config.signupOtpExpiryMinutes
        );
        return Math.max(Math.round(expiryMinutes * 60), 0);
    }

    function setOtpExpiredState(expired) {
        verifySubmitButton.disabled = expired;
        if (expired) {
            verifySubmitButton.textContent = "Code expired";
        } else if (verifySubmitButton.textContent === "Code expired") {
            verifySubmitButton.textContent = "Verify and continue";
        }
    }

    function getRemainingOtpExpirySeconds() {
        if (!pendingSignup || !pendingSignup.requested_at) {
            return getOtpExpiryWindowSeconds();
        }

        const requestedAt = new Date(pendingSignup.requested_at).getTime();
        if (!requestedAt) {
            return getOtpExpiryWindowSeconds();
        }

        const expiryAt = requestedAt + (getOtpExpiryWindowSeconds() * 1000);
        return Math.max(Math.ceil((expiryAt - Date.now()) / 1000), 0);
    }

    function updateOtpExpiryDisplay(seconds) {
        otpExpiryTimer.textContent = formatClock(seconds);
        setOtpExpiredState(seconds <= 0);
    }

    function startOtpExpiryCountdown() {
        window.clearInterval(expiryTimer);

        let remaining = getRemainingOtpExpirySeconds();
        updateOtpExpiryDisplay(remaining);

        if (remaining <= 0) {
            app.showFeedback(verifyFeedback, "This verification code has expired. Request a new code.", "error");
            return;
        }

        expiryTimer = window.setInterval(() => {
            remaining -= 1;
            updateOtpExpiryDisplay(remaining);

            if (remaining <= 0) {
                window.clearInterval(expiryTimer);
                expiryTimer = null;
                app.showFeedback(verifyFeedback, "This verification code has expired. Request a new code.", "error");
            }
        }, 1000);
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
        if (getRemainingOtpExpirySeconds() <= 0) {
            app.showFeedback(verifyFeedback, "This verification code has expired. Request a new code.", "error");
            setOtpExpiredState(true);
            return;
        }

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
            if (getRemainingOtpExpirySeconds() <= 0) {
                setOtpExpiredState(true);
            }
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
            startOtpExpiryCountdown();
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

    if (!pendingSignup.requested_at || !pendingSignup.expires_in_minutes) {
        pendingSignup = {
            ...pendingSignup,
            requested_at: pendingSignup.requested_at || new Date().toISOString(),
            expires_in_minutes: config.signupOtpExpiryMinutes,
        };
        app.setPendingSignup(pendingSignup);
    }

    startOtpExpiryCountdown();
});
