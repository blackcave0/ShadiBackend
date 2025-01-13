const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { adminAuthMiddleware, checkPermission } = require('../middleware/adminAuth');

// Get dashboard statistics
router.get('/stats', adminAuthMiddleware, async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Get counts by status
    const [totalUsers, usersByStatus] = await Promise.all([
      User.countDocuments(),
      User.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Format status counts
    const statusCounts = usersByStatus.reduce((acc, curr) => {
      acc[curr._id || 'active'] = curr.count;
      return acc;
    }, {
      active: 0,
      inactive: 0,
      suspended: 0
    });

    // Get daily trends
    const dailyTrends = await Promise.all(
      [...Array(7)].map(async (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const endOfDay = new Date(date.setHours(23, 59, 59, 999));
        
        const count = await User.countDocuments({
          createdAt: { 
            $gte: startOfDay,
            $lte: endOfDay
          }
        });

        return {
          date: startOfDay.toISOString().split('T')[0],
          count
        };
      })
    );

    res.json({
      totalUsers,
      usersByStatus: statusCounts,
      dailyTrends: dailyTrends.reverse()
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Error fetching statistics' });
  }
});

// Get all users with pagination and search
router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    
    const searchQuery = search ? {
      $or: [
        { email: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ]
    } : {};

    const users = await User.find(searchQuery)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await User.countDocuments(searchQuery);

    res.json({
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalUsers: count
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Delete user
router.delete('/users/:userId', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Update user
router.put('/users/:userId', adminAuthMiddleware, async (req, res) => {
  try {
    const {
      email,
      status,
      profile,
      preferences,
    } = req.body;
    
    // Validate the update data
    if (email && !email.includes('@')) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const updateData = {
      ...(email && { email }),
      ...(status && { status }),
      ...(profile && { profile }),
      ...(preferences && { preferences }),
      updatedAt: new Date()
    };

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updateData },
      { 
        new: true,
        runValidators: true
      }
    )
    .select('-password')
    .populate('matches', 'email profile.firstName profile.lastName');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Get single user details
router.get('/users/:userId', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('matches', 'email profile.firstName profile.lastName')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Format dates for better display
    const userDetails = {
      ...user,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      profile: {
        ...user.profile,
        dateOfBirth: user.profile?.dateOfBirth ? 
          new Date(user.profile.dateOfBirth).toISOString().split('T')[0] : null,
      },
      lastActive: user.lastActive ? new Date(user.lastActive).toISOString() : null,
      matches: user.matches || [],
      preferences: user.preferences || {}
    };

    res.json(userDetails);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Error fetching user details' });
  }
});

module.exports = router; 