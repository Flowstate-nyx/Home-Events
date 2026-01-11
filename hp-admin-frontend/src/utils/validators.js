/**
 * Form Validation Utilities
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
export function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result with isValid and message
 */
export function validatePassword(password) {
  if (!password) {
    return { isValid: false, message: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { isValid: false, message: 'Password must be at least 6 characters' };
  }
  
  return { isValid: true, message: '' };
}

/**
 * Validate required field
 * @param {any} value - Value to check
 * @param {string} fieldName - Name of field for error message
 * @returns {object} Validation result
 */
export function validateRequired(value, fieldName = 'Field') {
  const isEmpty = value === null || 
                  value === undefined || 
                  value === '' || 
                  (Array.isArray(value) && value.length === 0);
  
  if (isEmpty) {
    return { isValid: false, message: `${fieldName} is required` };
  }
  
  return { isValid: true, message: '' };
}

/**
 * Validate number within range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} fieldName - Name of field for error message
 * @returns {object} Validation result
 */
export function validateNumberRange(value, min, max, fieldName = 'Value') {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, message: `${fieldName} is required` };
  }
  
  const num = Number(value);
  
  if (isNaN(num)) {
    return { isValid: false, message: `${fieldName} must be a number` };
  }
  
  if (num < min) {
    return { isValid: false, message: `${fieldName} must be at least ${min}` };
  }
  
  if (num > max) {
    return { isValid: false, message: `${fieldName} must be at most ${max}` };
  }
  
  return { isValid: true, message: '' };
}

/**
 * Validate date is not in the past
 * @param {string|Date} date - Date to validate
 * @param {string} fieldName - Name of field for error message
 * @returns {object} Validation result
 */
export function validateFutureDate(date, fieldName = 'Date') {
  if (!date) {
    return { isValid: false, message: `${fieldName} is required` };
  }
  
  const inputDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (isNaN(inputDate.getTime())) {
    return { isValid: false, message: `${fieldName} is invalid` };
  }
  
  if (inputDate < today) {
    return { isValid: false, message: `${fieldName} cannot be in the past` };
  }
  
  return { isValid: true, message: '' };
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
export function isValidUrl(url) {
  if (!url) return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate phone number (basic)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone is valid
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  // Remove spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Check if it's 8-15 digits (international format)
  return /^\+?[0-9]{8,15}$/.test(cleaned);
}

/**
 * Run multiple validations and return first error
 * @param {Array<object>} validations - Array of validation results
 * @returns {object} First failed validation or success
 */
export function runValidations(validations) {
  for (const validation of validations) {
    if (!validation.isValid) {
      return validation;
    }
  }
  return { isValid: true, message: '' };
}
