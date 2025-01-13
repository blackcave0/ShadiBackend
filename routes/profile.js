const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const streamifier = require('streamifier');

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'matrimony_app/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Get user profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/', authMiddleware, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'additionalPictures', maxCount: 4 }
]), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      religion,
      occupation,
      location,
      about
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Handle file uploads
    if (req.files) {
      if (req.files.profilePicture) {
        user.profile.profilePicture = req.files.profilePicture[0].path;
      }
      if (req.files.additionalPictures) {
        user.profile.additionalPictures = req.files.additionalPictures.map(file => file.path);
      }
    }

    // Update profile fields
    user.profile = {
      ...user.profile,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
      ...(gender && { gender }),
      ...(religion && { religion }),
      ...(occupation && { occupation }),
      ...(location && { location }),
      ...(about && { about })
    };

    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Delete profile picture
router.delete('/picture', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete from Cloudinary if needed
    if (user.profile.profilePicture) {
      const publicId = user.profile.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }

    user.profile.profilePicture = '';
    await user.save();

    res.json({ message: 'Profile picture deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile picture:', error);
    res.status(500).json({ message: 'Error deleting profile picture' });
  }
});

// Delete additional picture
router.delete('/pictures/:index', authMiddleware, async (req, res) => {
  try {
    const { index } = req.params;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.profile.additionalPictures[index]) {
      return res.status(404).json({ message: 'Picture not found' });
    }

    // Delete from Cloudinary if needed
    const publicId = user.profile.additionalPictures[index].split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(publicId);

    // Remove the picture from the array
    user.profile.additionalPictures.splice(index, 1);
    await user.save();

    res.json({ message: 'Picture deleted successfully' });
  } catch (error) {
    console.error('Error deleting picture:', error);
    res.status(500).json({ message: 'Error deleting picture' });
  }
});

// Add photos to profile
router.post('/photos', authMiddleware, upload.array('photos', 10), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'user_photos',
            resource_type: 'auto',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );

        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    });

    const photoUrls = await Promise.all(uploadPromises);
    
    if (!user.profile.photos) {
      user.profile.photos = [];
    }
    user.profile.photos.push(...photoUrls);
    await user.save();

    res.json({ 
      message: 'Photos uploaded successfully', 
      photos: user.profile.photos 
    });
  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).json({ 
      message: 'Error uploading photos',
      error: error.message 
    });
  }
});

// Delete photo
router.delete('/photos/:index', authMiddleware, async (req, res) => {
  try {
    const { index } = req.params;
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.profile.photos[index]) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    // Delete from Cloudinary
    const publicId = user.profile.photos[index].split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(publicId);

    // Remove the photo from the array
    user.profile.photos.splice(index, 1);
    await user.save();

    res.json({ 
      message: 'Photo deleted successfully',
      photos: user.profile.photos 
    });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ message: 'Error deleting photo' });
  }
});

// Get all photos
router.get('/photos', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ photos: user.profile.photos || [] });
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ message: 'Error fetching photos' });
  }
});

module.exports = router; 