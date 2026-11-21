export const INPUT_LIMITS = {
  name: 128,
  fullName: 255,
  email: 254,
  phone: 11,
  longText: 2000,
  search: 100,
};

export const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
export const PHONE_PATTERN = /^09\d{9}$/;
export const GMAIL_PATTERN = /^[A-Z0-9._%+-]+@gmail\.com$/i;
export const CEU_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@ceu\.edu\.ph$/i;

export function sanitizeName(value, maxLength = INPUT_LIMITS.name) {
  return value
    .replace(/[^\p{L}\p{M} .'-]/gu, "")
    .slice(0, maxLength);
}

export function sanitizePhone(value) {
  return value.replace(/\D/g, "").slice(0, INPUT_LIMITS.phone);
}

export function validateName(value, label = "Name", maxLength = INPUT_LIMITS.name) {
  const cleaned = value.trim();
  if (!cleaned) return `${label} is required.`;
  if (cleaned.length > maxLength) return `${label} must be ${maxLength} characters or fewer.`;
  if (!NAME_PATTERN.test(cleaned)) {
    return `${label} can only contain letters, spaces, apostrophes, hyphens, or periods.`;
  }
  return null;
}

export function validatePhone(value) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  return PHONE_PATTERN.test(cleaned)
    ? null
    : "Phone number must contain exactly 11 digits and start with 09.";
}

export function validateGmail(value) {
  const cleaned = value.trim();
  if (!cleaned) return null;
  return GMAIL_PATTERN.test(cleaned)
    ? null
    : "Email must be a valid @gmail.com address.";
}

export function validateCeuEmail(value) {
  const cleaned = value.trim();
  if (!cleaned) return "Email is required.";
  return CEU_EMAIL_PATTERN.test(cleaned)
    ? null
    : "Email must be a valid @ceu.edu.ph address.";
}

export function validatePatientForm(form) {
  const validations = [
    validateName(form.first_name, "First name"),
    validateName(form.last_name, "Last name"),
    validatePhone(form.phone || ""),
    validateGmail(form.email || ""),
  ];

  if (form.birth_date && form.birth_date > new Date().toISOString().slice(0, 10)) {
    validations.push("Birth date cannot be in the future.");
  }

  for (const [label, value] of [
    ["Visual condition", form.visual_condition],
    ["Case history", form.case_history],
    ["Notes", form.notes],
  ]) {
    if ((value || "").trim().length > INPUT_LIMITS.longText) {
      validations.push(`${label} must be ${INPUT_LIMITS.longText} characters or fewer.`);
    }
  }

  return validations.find(Boolean) || null;
}

export function apiErrorMessage(data, fallback) {
  if (typeof data?.error === "string") return data.error;
  if (!data || typeof data !== "object") return fallback;

  const first = Object.values(data).flat()[0];
  return typeof first === "string" ? first : fallback;
}
