/**
 * Validation Utilities - Form validation yardımcı fonksiyonları
 */

/**
 * Email validation
 */
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Required field validation
 */
export function validateRequired(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Min length validation
 */
export function validateMinLength(value, min) {
  if (!value) return false;
  return String(value).length >= min;
}

/**
 * Max length validation
 */
export function validateMaxLength(value, max) {
  if (!value) return true;
  return String(value).length <= max;
}

/**
 * Number validation
 */
export function validateNumber(value) {
  return !isNaN(value) && !isNaN(parseFloat(value));
}

/**
 * Positive number validation
 */
export function validatePositive(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0;
}

/**
 * ISBN validation (13 digits)
 */
export function validateISBN(isbn) {
  const cleaned = String(isbn).replace(/[-\s]/g, '');
  return /^\d{13}$/.test(cleaned);
}

/**
 * Phone validation (Turkish format)
 */
export function validatePhone(phone) {
  const cleaned = String(phone).replace(/[-\s()]/g, '');
  return /^(\+90|0)?[5][0-9]{9}$/.test(cleaned);
}

/**
 * Date validation
 */
export function validateDate(date) {
  if (!date) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
}

/**
 * Future date validation
 */
export function validateFutureDate(date) {
  if (!validateDate(date)) return false;
  return new Date(date) > new Date();
}

/**
 * Past date validation
 */
export function validatePastDate(date) {
  if (!validateDate(date)) return false;
  return new Date(date) < new Date();
}

/**
 * Generic validator - multiple rules
 */
export function validate(value, rules = {}) {
  const errors = [];

  if (rules.required && !validateRequired(value)) {
    errors.push(rules.requiredMessage || 'Bu alan zorunludur');
  }

  if (value && rules.minLength && !validateMinLength(value, rules.minLength)) {
    errors.push(
      rules.minLengthMessage || `En az ${rules.minLength} karakter olmalıdır`
    );
  }

  if (value && rules.maxLength && !validateMaxLength(value, rules.maxLength)) {
    errors.push(
      rules.maxLengthMessage || `En fazla ${rules.maxLength} karakter olabilir`
    );
  }

  if (value && rules.email && !validateEmail(value)) {
    errors.push(rules.emailMessage || 'Geçerli bir e-posta adresi giriniz');
  }

  if (value && rules.number && !validateNumber(value)) {
    errors.push(rules.numberMessage || 'Geçerli bir sayı giriniz');
  }

  if (value && rules.positive && !validatePositive(value)) {
    errors.push(rules.positiveMessage || 'Pozitif bir sayı olmalıdır');
  }

  if (value && rules.isbn && !validateISBN(value)) {
    errors.push(rules.isbnMessage || 'Geçerli bir ISBN numarası giriniz (13 haneli)');
  }

  if (value && rules.phone && !validatePhone(value)) {
    errors.push(rules.phoneMessage || 'Geçerli bir telefon numarası giriniz');
  }

  if (value && rules.date && !validateDate(value)) {
    errors.push(rules.dateMessage || 'Geçerli bir tarih giriniz');
  }

  if (value && rules.futureDate && !validateFutureDate(value)) {
    errors.push(rules.futureDateMessage || 'Gelecek bir tarih olmalıdır');
  }

  if (value && rules.pastDate && !validatePastDate(value)) {
    errors.push(rules.pastDateMessage || 'Geçmiş bir tarih olmalıdır');
  }

  if (value && rules.custom && typeof rules.custom === 'function') {
    const customError = rules.custom(value);
    if (customError) {
      errors.push(customError);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    firstError: errors[0] || null,
  };
}

/**
 * Form validator - validates entire form
 */
export function validateForm(formData, schema) {
  const errors = {};
  let isValid = true;

  Object.keys(schema).forEach((field) => {
    const rules = schema[field];
    const value = formData[field];
    const result = validate(value, rules);

    if (!result.isValid) {
      errors[field] = result.firstError;
      isValid = false;
    }
  });

  return {
    isValid,
    errors,
  };
}

/**
 * Real-time validation hook helper
 * Note: This requires React to be imported in the component using it
 */
export function createFieldValidationHook(React) {
  return function useFieldValidation(fieldName, rules, value) {
    const [error, setError] = React.useState(null);
    const [touched, setTouched] = React.useState(false);

    React.useEffect(() => {
      if (touched || value) {
        const result = validate(value, rules);
        setError(result.firstError);
      }
    }, [value, touched, rules]);

    const handleBlur = () => {
      setTouched(true);
      const result = validate(value, rules);
      setError(result.firstError);
    };

    return {
      error,
      touched,
      handleBlur,
      setTouched,
    };
  };
}
