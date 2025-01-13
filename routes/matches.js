const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Get potential matches with filters
router.get('/potential', authMiddleware, async (req, res) => {
  try {
    const { minAge = '0', maxAge = '100', religion } = req.query;
    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert string ages to numbers
    const minAgeNum = parseInt(minAge);
    const maxAgeNum = parseInt(maxAge);

    // Calculate date range for age filter
    const today = new Date();
    const minDate = new Date(today.getFullYear() - maxAgeNum - 1, today.getMonth(), today.getDate());
    const maxDate = new Date(today.getFullYear() - minAgeNum, today.getMonth(), today.getDate());

    // Build filter query
    const filterQuery = {
      _id: { $ne: req.user._id },
      'profile.dateOfBirth': { $gte: minDate, $lte: maxDate }
    };

    if (religion) {
      filterQuery['profile.religion'] = religion;
    }

    // Exclude users that current user has already liked or matched with
    if (currentUser.likes && currentUser.likes.length > 0) {
      filterQuery._id.$nin = currentUser.likes;
    }
    if (currentUser.matches && currentUser.matches.length > 0) {
      filterQuery._id.$nin = [...(filterQuery._id.$nin || []), ...currentUser.matches];
    }

    const potentialMatches = await User.find(filterQuery)
      .select('profile')
      .lean();

    // Add age to each profile
    const matchesWithAge = potentialMatches.map(match => ({
      ...match,
      profile: {
        ...match.profile,
        age: calculateAge(match.profile.dateOfBirth)
      }
    }));

    res.json({ matches: matchesWithAge });
  } catch (error) {
    console.error('Error fetching potential matches:', error);
    res.status(500).json({ message: 'Error fetching potential matches' });
  }
});

// Like a profile
router.post('/like/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(req.user._id);
    const likedUser = await User.findById(userId);

    if (!currentUser || !likedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already liked
    if (currentUser.likes.includes(userId)) {
      return res.status(400).json({ message: 'Profile already liked' });
    }

    // Add to likes array
    currentUser.likes.push(userId);
    
    // Increment liked user's likesCount
    likedUser.likesCount = (likedUser.likesCount || 0) + 1;

    // Check if it's a match (if the other user has already liked current user)
    const isMatch = likedUser.likes.includes(currentUser._id);

    if (isMatch) {
      // Create match for both users
      currentUser.matches.push(userId);
      likedUser.matches.push(currentUser._id);
      
      // Remove from likes array since they're now matched
      currentUser.likes = currentUser.likes.filter(id => !id.equals(userId));
      likedUser.likes = likedUser.likes.filter(id => !id.equals(currentUser._id));
    }

    await Promise.all([currentUser.save(), likedUser.save()]);

    res.json({ 
      message: isMatch ? 'Match created!' : 'Profile liked',
      isMatch,
      likesCount: likedUser.likesCount
    });
  } catch (error) {
    console.error('Error liking profile:', error);
    res.status(500).json({ message: 'Error liking profile' });
  }
});

// Get liked profiles
router.get('/liked', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const likedProfiles = await User.find({
      _id: { $in: user.likes }
    })
    .select('profile likesCount')
    .lean();

    // Add age to each profile
    const profilesWithAge = likedProfiles.map(profile => ({
      ...profile,
      profile: {
        ...profile.profile,
        age: calculateAge(profile.profile.dateOfBirth)
      }
    }));

    res.json({ 
      likedProfiles: profilesWithAge,
      totalLikes: profilesWithAge.length
    });
  } catch (error) {
    console.error('Error fetching liked profiles:', error);
    res.status(500).json({ message: 'Error fetching liked profiles' });
  }
});

// Helper function to calculate age
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

module.exports = router; 