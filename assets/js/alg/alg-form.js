/**
 * ==============================================================================
 * ALG Company — Universal Form Validator & HTTP 422 Binder (2026)
 * ==============================================================================
 * Connects standard HTML forms to the ALG API Client:
 * - Client-side validation rules (required, email, minLength, pattern)
 * - Automatic HTTP 422 validation error mapping to inputs (.is-invalid)
 * - Auto-disables submit button with loading spinner during submission
 * - Clears errors on user input
 * ==============================================================================
 */

class AlgForm {
  /**
   * Bind an HTML form for auto-validation and API handling
   * @param {HTMLFormElement|string} form Form element or selector
   * @param {Object} options { onSubmit: async (data, form) => {}, rules: {} }
   */
  static bind(form, options = {}) {
    const formEl = typeof form === 'string' ? document.querySelector(form) : form;
    if (!formEl) return;

    formEl.setAttribute('novalidate', 'true');

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.clearErrors(formEl);

      const formData = new FormData(formEl);
      const data = Object.fromEntries(formData.entries());

      // 1. Client-side validation
      const errors = this.validate(data, options.rules || {});
      if (Object.keys(errors).length > 0) {
        this.applyErrors(formEl, errors);
        return;
      }

      // 2. Submit handler with loading button state
      const submitBtn = formEl.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing...`;
      }

      try {
        if (typeof options.onSubmit === 'function') {
          await options.onSubmit(data, formEl);
        }
      } catch (err) {
        // Automatically map HTTP 422 validation errors from backend
        if (err.statusCode === 422 && err.errors) {
          this.applyErrors(formEl, err.errors);
        } else {
          window.algToast?.error(err.message || 'An error occurred during submission.');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });

    // Clear error on input focus / change
    formEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        const feedback = e.target.parentNode.querySelector('.invalid-feedback');
        if (feedback) feedback.remove();
      }
    });
  }

  static validate(data, rules) {
    const errors = {};
    for (const [field, rule] of Object.entries(rules)) {
      const val = (data[field] || '').trim();

      if (rule.required && !val) {
        errors[field] = rule.message || `${this.formatFieldName(field)} is required.`;
        continue;
      }

      if (rule.email && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[field] = 'Please provide a valid email address.';
        continue;
      }

      if (rule.minLength && val.length < rule.minLength) {
        errors[field] = `Must be at least ${rule.minLength} characters.`;
        continue;
      }

      if (rule.pattern && !rule.pattern.test(val)) {
        errors[field] = rule.message || 'Invalid format.';
        continue;
      }
    }
    return errors;
  }

  static applyErrors(formEl, errors) {
    for (const [field, message] of Object.entries(errors)) {
      const input = formEl.querySelector(`[name="${field}"]`);
      if (input) {
        input.classList.add('is-invalid');
        let feedback = input.parentNode.querySelector('.invalid-feedback');
        if (!feedback) {
          feedback = document.createElement('div');
          feedback.className = 'invalid-feedback';
          input.parentNode.appendChild(feedback);
        }
        feedback.textContent = Array.isArray(message) ? message[0] : message;
      }
    }
  }

  static clearErrors(formEl) {
    formEl.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    formEl.querySelectorAll('.invalid-feedback').forEach(el => el.remove());
  }

  static formatFieldName(field) {
    return field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

window.AlgForm = AlgForm;
