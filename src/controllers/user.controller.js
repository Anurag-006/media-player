import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const options = {
    httpOnly: true,
    secure: true,
};

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;

        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating Request and Access Tokens"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    // fetch user details from frontend.
    const { fullName, email, password, username } = req.body;

    // Validate user details

    if (
        [fullName, email, password, username].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All Fields are required");
    }
    // Check if user already exists.
    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    // Check for avatar and coverImage

    let avatarLocalPath = "";

    if (
        req.files &&
        Array.isArray(req.files.avatar) &&
        req.files.avatar.length > 0
    ) {
        avatarLocalPath = req.files.avatar[0].path;
    }

    let coverImageLocalPath = "";

    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (avatarLocalPath === "") {
        throw new ApiError(400, "Avatar file is required.");
    }

    // Upload them to cloudinary.
    let avatar;
    let coverImage;

    if (avatarLocalPath !== "") {
        avatar = await uploadOnCloudinary(avatarLocalPath);
    }
    if (coverImageLocalPath !== "")
        coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required.");
    }

    // Create user object and entry in db.
    const newUser = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    });

    // Remove password and refreshToken field from response
    const createdUser = await User.findById(newUser._id).select(
        "-password -refreshToken"
    );

    // Check for user creation.
    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user"
        );
    }

    // Return response.
    return res
        .status(201)
        .json(new ApiResponse(200, createdUser, "User Registered Succesfully"));
});

const loginUser = asyncHandler(async (req, res) => {
    // get username and password from req (Frontend)

    const userDetails = req.body;

    // verify Username
    const user = await User.findOne({ username: userDetails.username });
    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    // verify Password
    const isUserPasswordCorrect = await user.isPasswordCorrect(
        userDetails.password
    );
    if (!isUserPasswordCorrect) {
        throw new ApiError(402, "Incorrect login credentials");
    }

    // if username and password match generate Access Token

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
    );

    // give user the access token to continue and save it in a cookie

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    // return response.
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged In successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            },
        },
        {
            new: true,
        }
    );

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User Logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    // Fetch refresh token from user from cookies or req
    const incommingRefreshToken =
        req.cookies?.refreshToken || req.body.refreshToken;
    if (!incommingRefreshToken) {
        throw new ApiError(401, "No Refresh Token");
    }
    try {
        // Check if refresh token matches
        const decodedToken = jwt.verify(
            incommingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );
        if (!decodedToken) {
            throw new ApiError(401, "Invalid refresh token");
        }
        const user = User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid Refresh Token");
        }

        if (incommingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Unauthorized access");
        }
        // generate new refresh token and update in db

        const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
            user._id
        );

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json( new ApiResponse(
                200,
                { accessToken, refreshToken },
                "Access Token Refreshed"
            ));
    } catch (error) {
        throw new ApiError(400, error?.message || "Invalid Refresh Token");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    // get old and new passwords from frontend
    const {oldPassword, newPassword} = req.body

    // verify Them

    const user = await User.findById(req.user?._id)

    if (!user) {
        throw new ApiError(400, "User not Logged In")
    }

    const isUserPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isUserPasswordCorrect) {
        throw new ApiError(401, "Incorrect Password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.status(200).json(new ApiResponse(
        200,
        {},
        "User Password Changed Succesfully"
    ))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        user: req.user,
        "Current User Details Fetched Succesfully"
    ))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body

    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {new: true}
        
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
});

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    //TODO: delete old image - assignment

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image updated successfully")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }

    //TODO: delete old image - assignment


    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading on avatar")
        
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

export { 
    registerUser,
    loginUser,
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails, 
    updateUserAvatar, 
    updateUserCoverImage 
};