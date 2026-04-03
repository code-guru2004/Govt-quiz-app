const userModel = require("../models/User");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");
//const emailService = require("../services/email.service")


async function registerUser(req, res){
    const {email, name, password, mobile} = req.body;

    const isExists = await userModel.findOne({email});

    if(isExists){
        return res.status(422).json({
            success: false,
            message: "User alreasy exists"
        });
    }

    const newUser = await userModel.create({
        email,
        name,
        password,
        mobile
    });

    const token = jwt.sign({
        userId: newUser._id,
        role: newUser.role
    }, process.env.JWT_SECRET,{expiresIn:"3d"});

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/", // ✅ VERY IMPORTANT
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });

    res.status(201).json({
        success: true,
        message: "User register successfully",
        user: {
            _id: newUser._id,
            email: newUser.email,
            name: newUser.name,
            mobile: newUser.mobile
        },
        token
    });

    //  await emailService.sendRegistrationemail(newUser.email,newUser.name)

}


async function loginUser(req,res) {
    const {email, password} = req.body;

    const user = await userModel.findOne({email}).select("+password");

    if(!user){
        return res.status(401).json({
            success: false,
            message: "User not found"
        })
    }

    const isCorrectPassword = await user.comparePassword(password);

    if(!isCorrectPassword){
        return res.status(401).json({
            success: false,
            message: "Password is invalid"
        })
    }

    const token = jwt.sign({
        userId: user._id,
        role: user.role
    },process.env.JWT_SECRET,{expiresIn: "3d"});

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        path: "/", // ✅ VERY IMPORTANT
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });

    res.status(200).json({
        success: true,
        message: "User login successfully",
        user:{
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })
}

// GET current user
async function getMe(req, res) {
    try {
      const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  
      if (!token) {
        return res.status(401).json({ success: false });
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
      const user = await userModel.findById(decoded.userId).select("-password");
  
      res.json({
        success: true,
        user,
      });
    } catch (err) {
      res.status(401).json({ success: false });
    }
  }


// logout
async function logoutUser(req,res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if(!token){
        return res.status(401).json({
            success: false,
            message: "No token provided"
        });
    }

    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
      });

    await tokenBlackListModel.create({
        token: token
    });
    return res.status(200).json({
        success: false,
        message: "logout successful"
    });
}
module.exports = {registerUser, loginUser, logoutUser, getMe}