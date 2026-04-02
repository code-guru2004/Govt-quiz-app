
// TTL - Time to Leave for token
const mongoose = require("mongoose");

const tokenBlackListSchema = new mongoose.Schema({
    token : {
        type: String,
        required: [true, "Token is required."],
        unique: [true, "Token must be unique."]
    },
    
},{
    timestamps: true
});

tokenBlackListSchema.index({createdAt: 1},
    {
        expireAfterSeconds: 60 * 60 * 24 * 3 //3 DAYS
    }
);

const tokenBlackListModel = mongoose.model("TokenBlackList", tokenBlackListSchema);

module.exports = tokenBlackListModel;