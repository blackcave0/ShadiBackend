const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    // console.log('Received token:', token); // Debug log

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log('Decoded token:', decoded); // Debug log

    if (!decoded.adminId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const admin = await Admin.findById(decoded.adminId).select('-password');
    // console.log('Found admin:', admin); // Debug log

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Middleware to check specific permissions
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin.permissions.includes(permission)) {
      return res.status(403).json({ 
        message: 'You do not have permission to perform this action' 
      });
    }
    next();
  };
};

module.exports = { adminAuthMiddleware, checkPermission };
