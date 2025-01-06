import { Router } from "express"
import { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser } from "../controllers/user.controller.js"
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
const userApp = Router()

userApp.route("/register").post(
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]) 
    ,registerUser
)

userApp.route("/login").post(loginUser)

userApp.get("/testlogin", verifyJWT, (req, res) => {
    res.send({message: "Super secret data here.... Only visible after loggin in"})
})

userApp.route("/logout").post(verifyJWT, logoutUser)
userApp.route("/refresh-token").post(refreshAccessToken)
userApp.route("/change-password").post(verifyJWT, changeCurrentPassword)
userApp.route("/get-user").get(verifyJWT, getCurrentUser)
export default userApp