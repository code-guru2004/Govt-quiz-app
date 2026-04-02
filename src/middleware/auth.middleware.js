const userModel = require("../models/User");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");

async function authMiddleware(req, res, next){
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1]; // Get token from cookie or Authorization header

        if(!token){
            return res.status(401).json({
                success: false,
                message: "Unauthorized: No token provided"
            });
        }
      //  console.log("Auth middleware token:", token);
        // check token is in blacklist or not
    const isTokenExist = await tokenBlackListModel.findOne({token: token});

    if(isTokenExist){
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Token is in blacklist"
        });
    }

        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token and decode payload

        const user = await userModel.findById(decoded.userId); // Find user by ID from token payload


        
        if(!user){
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User not found"
            });
        }
        
        req.user = user; // Attach user object to request for use in next middleware or route handler

        next(); // Proceed to next middleware or route handler

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid token"
        });
    }   

}

// This middleware can be used to protect routes that require admin access. It checks if the authenticated user has the systemUser flag set to true, indicating they are an admin.
async function adminMiddleware(req, res, next){

    try {

        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
        //console.log("Admin middleware token:", token);
        
        if(!token){
            return res.status(401).json({
                success: false,
                message: "Unauthorized: No token provided"
            });
        }
        
        

        // Check blacklist
        const isTokenExist = await tokenBlackListModel.findOne({ token });
        if(isTokenExist){
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Token is in blacklist"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ✅ FIX HERE
        const user = await userModel.findById(decoded.userId);
        
        
        if(!user || user.role !== "admin"){
            return res.status(403).json({
                success: false,
                message: "Forbidden: Admin access required"
            });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid token"
        });
    }
}
module.exports = { authMiddleware, adminMiddleware };