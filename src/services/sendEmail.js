const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

exports.sendEmail = async ({ to, subject, html }) => {
  try {
    console.log("Sending email to:", to);
    await transporter.sendMail({
      from: `"Test Easy Mate" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("EMAIL ERROR:", err);
    throw err;
  }
};