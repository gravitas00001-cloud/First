document.addEventListener("DOMContentLoaded", async () => {
    const app = window.FakeKiloApp;
    const config = app.config;
    const requestForm = document.getElementById("passwordResetRequestForm");
    const requestFeedback = document.getElementById("passwordResetRequestFeedback");
    const requestSubmitButton = document.getElementById("passwordResetRequestSubmitButton");
    const emailInput = requestForm.elements.email;
    const introNote = document.getElementById("passwordResetIntroNote");
    const otpSection = document.getElementById("passwordResetOtpSection");
    const emailLabel = document.getElementById("pendingPasswordResetEmail");
    const otpInput = document.getElementById("passwordResetOtpCodeInput");
    const verifyForm = document.getElementById("passwordResetVerifyForm");
    const verifyFeedback = document.getElementById("passwordResetVerifyFeedback");
    const verifySubmitButton = document.getElementById("passwordResetVerifySubmitButton");
    const resendButton = document.getElementById("passwordResetResendOtpButton");
    const useAnotherEmailButton = document.getElementById("passwordResetUseAnotherEmailButton");
    const otpExpiryTimer = document.getElementById("passwordResetOtpExpiryTimer");
    let pendingPasswordReset = app.getPendingPasswordReset();
    let countdownTimer = null;
    let expiryTimer = null;

    if (await app.redirectToDashboardIfAuthenticated()) {
        return;
    }

    function setButtonBusy(button, busy, idleLabel, busyLabel) {
        button.disabled = busy;
        button.textContent = busy ? busyLabel : idleLabel;
    }

    function showOtpSection(email) {
        emailInput.value = email;
        emailInput.readOnly = true;
        introNote.textContent = "Check your inbox, then enter the verification code below to continue.";
        emailLabel.textContent = email;
        otpSection.hidden = false;
        startOtpExpiryCountdown();
    }

    function resetOtpSection() {
        window.clearInterval(countdownTimer);
        window.clearInterval(expiryTimer);
        countdownTimer = null;
        expiryTimer = null;
        emailInput.readOnly = false;
        introNote.textContent = "After the code is verified, we will take you straight to the new password page.";
        otpSection.hidden = true;
        otpInput.value = "";
        resendButton.disabled = false;
        resendButton.textContent = "Resend code";
        verifySubmitButton.disabled = false;
        verifySubmitButton.textContent = "Verify and continue";
        otpExpiryTimer.textContent = formatClock(config.passwordResetOtpExpiryMinutes * 60);
        app.hideFeedback(verifyFeedback);
    }

    function syncPendingState(email, extras = {}) {
        pendingPasswordReset = {
            email,
            requested_at: new Date().toISOString(),
            expires_in_minutes: config.passwordResetOtpExpiryMinutes,
            ...extras,
        };
        app.setPendingPasswordReset(pendingPasswordReset);
    }

    function formatClock(totalSeconds) {
        const safeSeconds = Math.max(Number(totalSeconds) || 0, 0);
        const minutes = Math.floor(safeSeconds / 60);
        const seconds = safeSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function getOtpExpiryWindowSeconds() {
        const expiryMinutes = Number(
            pendingPasswordReset && pendingPasswordReset.expires_in_minutes
                ? pendingPasswordReset.expires_in_minutes
                : config.passwordResetOtpExpiryMinutes
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
        if (!pendingPasswordReset || !pendingPasswordReset.requested_at) {
            return getOtpExpiryWindowSeconds();
        }

        const requestedAt = new Date(pendingPasswordReset.requested_at).getTime();
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
        const totalSeconds = Math.max(Number(seconds) || config.passwordResetResendCooldownSeconds, 1);
        let remaining = totalSeconds;

        window.clearInterval(countdownTimer);
        resendButton.disabled = true;
        resendButton.textContent = `Resend in ${remaining}s`;

        countdownTimer = window.setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                window.clearInterval(countdownTimer);
                countdownTimer = null;
                resendButton.disabled = false;
                resendButton.textContent = "Resend code";
                return;
            }

            resendButton.textContent = `Resend in ${remaining}s`;
        }, 1000);
    }

    function getRemainingCooldownSeconds() {
        if (!pendingPasswordReset || !pendingPasswordReset.requested_at) {
            return 0;
        }

        const requestedAt = new Date(pendingPasswordReset.requested_at).getTime();
        if (!requestedAt) {
            return 0;
        }

        const elapsedSeconds = Math.floor((Date.now() - requestedAt) / 1000);
        return Math.max(config.passwordResetResendCooldownSeconds - elapsedSeconds, 0);
    }

    async function handleRequest(event) {
        event.preventDefault();
        app.hideFeedback(requestFeedback);
        setButtonBusy(requestSubmitButton, true, "Send reset code", "Sending reset code...");

        try {
            const email = String(emailInput.value || "").trim();
            const data = await app.request(config.urls.requestPasswordReset, {
                method: "POST",
                body: { email },
            });

            app.clearVerifiedPasswordReset();
            syncPendingState(email);
            showOtpSection(email);
            app.showFeedback(requestFeedback, data.message, "success");
            startResendCountdown(config.passwordResetResendCooldownSeconds);
            otpInput.focus();
        } catch (error) {
            app.showFeedback(requestFeedback, error.message, "error");
        } finally {
            setButtonBusy(requestSubmitButton, false, "Send reset code", "Sending reset code...");
        }
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
            const data = await app.request(config.urls.verifyPasswordResetOtp, {
                method: "POST",
                body: {
                    email: pendingPasswordReset.email,
                    otp: String(otpInput.value || "").trim(),
                },
            });

            app.setVerifiedPasswordReset({
                email: data.email,
                reset_token: data.reset_token,
                verified_at: new Date().toISOString(),
            });
            window.location.assign(config.urls.passwordResetConfirmPage);
        } catch (error) {
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
        setButtonBusy(resendButton, true, "Resend code", "Sending...");

        try {
            const data = await app.request(config.urls.resendPasswordResetOtp, {
                method: "POST",
                body: { email: pendingPasswordReset.email },
            });

            syncPendingState(pendingPasswordReset.email);
            app.clearVerifiedPasswordReset();
            app.showFeedback(verifyFeedback, data.message, "success");
            startResendCountdown(config.passwordResetResendCooldownSeconds);
            startOtpExpiryCountdown();
            otpInput.focus();
        } catch (error) {
            if (error.data && error.data.retry_after) {
                app.showFeedback(verifyFeedback, error.message, "error");
                startResendCountdown(error.data.retry_after);
                return;
            }

            app.showFeedback(verifyFeedback, error.message, "error");
            resendButton.disabled = false;
            resendButton.textContent = "Resend code";
        }
    }

    function handleUseAnotherEmail() {
        app.clearPendingPasswordReset();
        app.clearVerifiedPasswordReset();
        pendingPasswordReset = null;
        resetOtpSection();
        app.hideFeedback(requestFeedback);
        emailInput.focus();
    }

    otpInput.addEventListener("input", () => {
        otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, config.passwordResetOtpLength);
    });

    requestForm.addEventListener("submit", handleRequest);
    verifyForm.addEventListener("submit", handleVerify);
    resendButton.addEventListener("click", handleResend);
    useAnotherEmailButton.addEventListener("click", handleUseAnotherEmail);

    if (pendingPasswordReset && pendingPasswordReset.email) {
        if (!pendingPasswordReset.requested_at || !pendingPasswordReset.expires_in_minutes) {
            pendingPasswordReset = {
                ...pendingPasswordReset,
                requested_at: pendingPasswordReset.requested_at || new Date().toISOString(),
                expires_in_minutes: config.passwordResetOtpExpiryMinutes,
            };
            app.setPendingPasswordReset(pendingPasswordReset);
        }

        showOtpSection(pendingPasswordReset.email);
        const remainingCooldown = getRemainingCooldownSeconds();
        if (remainingCooldown > 0) {
            startResendCountdown(remainingCooldown);
        }
    } else {
        resetOtpSection();
    }
});
