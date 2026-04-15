exports.otpTemplate = (otp, name = "User") => {
    return `
    <div style="font-family: Arial, sans-serif; background:#f9fafb; padding:40px;">
      <div style="max-width:500px;margin:auto;background:white;padding:30px;border-radius:12px;">
        
        <h2 style="text-align:center;color:#111;">Verify Your Account</h2>
        
        <p style="text-align:center;color:#555;">
          Hi ${name}, use the OTP below to verify your account
        </p>
  
        <div style="text-align:center;margin:30px 0;">
          <span style="
            font-size:32px;
            letter-spacing:8px;
            font-weight:bold;
            color:#111;
          ">
            ${otp}
          </span>
        </div>
  
        <p style="text-align:center;color:#888;font-size:14px;">
          This OTP is valid for 5 minutes
        </p>
  
        <hr style="margin:20px 0;" />
  
        <p style="text-align:center;font-size:12px;color:#aaa;">
          If you didn’t request this, ignore this email.
        </p>
  
      </div>
    </div>
    `;
  };