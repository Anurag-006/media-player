import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler( async (req, res) => {
    // fetch user details from frontend.
    const {fullName, email, password, username} = req.body
    
    // Validate user details
    if (
        [fullName, email, password, username].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All Fields are required")
    }

    // Check if user already exists.
    const existedUser = await User.findOne({
        $or: [{ username: username },{ email: email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }

    // Check for avatar and coverImage
    
    const avatarLocalPath = req.files?.avatar[0]?.path;
    
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required.")
    }

    // Upload them to cloudinary.
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required.")
    }

    // Create user object and entry in db.
    const newUser = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    // Remove password and refreshToken field from response
    const createdUser = await User.findById(newUser._id).select(
        "-password -refreshToken"
    )

    // Check for user creation.
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // Return response.
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Succesfully")
    )
})

export {registerUser}