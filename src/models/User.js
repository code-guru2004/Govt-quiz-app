const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email:{
      type: String,
      required: [true, "Email is required"],
      unique: [true, "This email is already registered"],
      trim: true,
      lowercase: true,
      match: [emailRegex, "please enter a valid email address"]
  },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false // 🔥 hide password by default
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10}$/, "Please enter a valid 10-digit mobile number"]

    },

    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      
    },

    isVerified: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);


userSchema.pre("save", async function(){ // Hash password before saving
  if(!this.isModified("password")){
      return;
  }
  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
  return;
});

userSchema.methods.comparePassword = async function(candidatePassword){
  // console.log(candidatePassword,this.password);
  
  return await bcrypt.compare(candidatePassword, this.password); // Returns true if passwords match, false otherwise
}

module.exports = mongoose.model("User", userSchema);