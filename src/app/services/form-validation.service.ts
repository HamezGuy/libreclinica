import { Injectable } from '@angular/core';
import { 
  FormTemplate, 
  FormField, 
  FormInstance, 
  ValidationRule, 
  FormValidationResult, 
  FormValidationError, 
  FormValidationWarning,
  ConditionalRule 
} from '../models/form-template.model';

@Injectable({
  providedIn: 'root'
})
export class FormValidationService {

  /**
   * Validate a complete form instance against its template
   */
  validateFormInstance(instance: FormInstance, template: FormTemplate): FormValidationResult {
    const allErrors: FormValidationError[] = [];
    const warnings: FormValidationWarning[] = [];

    // Validate each field
    template.fields.forEach(field => {
      const value = instance.formData[field.id];
      const fieldErrors = this.validateField(field, value, instance.formData, template);
      
      // Add field errors to the flat array
      allErrors.push(...fieldErrors);

      // Generate warnings for the field
      const fieldWarnings = this.generateFieldWarnings(field, value, instance.formData);
      warnings.push(...fieldWarnings);
    });

    // Commented out nested forms validation as nestedForms property no longer exists
    // Object.entries(instance.nestedForms || {}).forEach(([fieldId, nestedInstances]) => {
    //   const nestedField = template.fields.find(f => f.id === fieldId);
    //   if (nestedField && Array.isArray(nestedInstances)) {
    //     nestedInstances.forEach((nestedInstance, index) => {
    //       // Validate nested instance
    //       // This would need to be implemented based on your nested form structure
    //     });
    //   }
    // });

    // Validate cross-field rules
    const crossFieldErrors = this.validateCrossFieldRules(template, instance.formData);
    
    // Add cross-field errors to the flat array
    allErrors.push(...crossFieldErrors);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings
    };
  }

  /**
   * Validate a single field value
   */
  validateField(
    field: FormField, 
    value: any, 
    allData: Record<string, any>,
    template: FormTemplate
  ): FormValidationError[] {
    const errors: FormValidationError[] = [];

    // Check if field should be shown based on conditional logic
    if (!this.shouldShowField(field, allData)) {
      return errors; // Skip validation for hidden fields
    }

    // Check if field is required (considering conditional requirements)
    const isRequired = this.isFieldRequired(field, allData);
    
    if (isRequired && this.isEmpty(value)) {
      errors.push({
        fieldId: field.id,
        fieldName: field.label,
        message: `${field.label} is required`,
        errorType: 'required'
      });
      return errors; // No point in further validation if required field is empty
    }

    // Skip validation if field is empty and not required
    if (this.isEmpty(value)) {
      return errors;
    }

    // Type-specific validation
    const typeErrors = this.validateFieldType(field, value);
    errors.push(...typeErrors);

    // Validation rules
    field.validationRules.forEach(rule => {
      const ruleError = this.validateRule(field, value, rule, allData);
      if (ruleError) {
        errors.push(ruleError);
      }
    });

    // Backend limits validation
    const limitErrors = this.validateBackendLimits(field, value);
    errors.push(...limitErrors);

    return errors;
  }

  /**
   * Validate field type-specific constraints
   */
  private validateFieldType(field: FormField, value: any): FormValidationError[] {
    const errors: FormValidationError[] = [];

    switch (field.type) {
      case 'number':
        if (typeof value !== 'number' && !this.isNumeric(value)) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: `${field.label} must be a valid number`,
            errorType: 'format'
          });
        }
        break;

      case 'date':
      case 'datetime':
        if (!this.isValidDate(value)) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: `${field.label} must be a valid date`,
            errorType: 'format'
          });
        }
        break;

      case 'select':
      case 'radio':
        if (field.options && !field.options.some(opt => opt.value === value)) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: `${field.label} contains an invalid selection`,
            errorType: 'format'
          });
        }
        break;

      case 'multiselect':
        if (Array.isArray(value) && field.options) {
          const invalidValues = value.filter(v => !field.options!.some(opt => opt.value === v));
          if (invalidValues.length > 0) {
            errors.push({
              fieldId: field.id,
              fieldName: field.label,
              message: `${field.label} contains invalid selections: ${invalidValues.join(', ')}`,
              errorType: 'format'
            });
          }
        } else if (!Array.isArray(value)) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: `${field.label} must be an array for multiple selections`,
            errorType: 'format'
          });
        }
        break;

      case 'file':
      case 'image':
        if (typeof value === 'string' && value.length > 0) {
          // Validate file type if specified
          if (field.allowedFileTypes && field.allowedFileTypes.length > 0) {
            const fileExtension = value.split('.').pop()?.toLowerCase();
            if (!fileExtension || !field.allowedFileTypes.includes(fileExtension)) {
              errors.push({
                fieldId: field.id,
                fieldName: field.label,
                message: `${field.label} must be one of: ${field.allowedFileTypes.join(', ')}`,
                errorType: 'format'
              });
            }
          }
        }
        break;
    }

    return errors;
  }

  /**
   * Validate a specific validation rule
   */
  private validateRule(
    field: FormField, 
    value: any, 
    rule: ValidationRule,
    allData: Record<string, any>
  ): FormValidationError | null {
    switch (rule.type) {
      case 'min':
        if (field.type === 'number' && Number(value) < rule.value) {
          return {
            fieldId: field.id,
            fieldName: field.label,
            message: rule.message || `${field.label} must be at least ${rule.value}`,
            errorType: 'range'
          };
        }
        break;

      case 'max':
        if (field.type === 'number' && Number(value) > rule.value) {
          return {
            fieldId: field.id,
            fieldName: field.label,
            message: rule.message || `${field.label} must be at most ${rule.value}`,
            errorType: 'range'
          };
        }
        break;

      case 'minLength':
        if (typeof value === 'string' && value.length < rule.value) {
          return {
            fieldId: field.id,
            fieldName: field.label,
            message: rule.message || `${field.label} must be at least ${rule.value} characters`,
            errorType: 'format'
          };
        }
        break;

      case 'maxLength':
        if (typeof value === 'string' && value.length > rule.value) {
          return {
            fieldId: field.id,
            fieldName: field.label,
            message: rule.message || `${field.label} must be at most ${rule.value} characters`,
            errorType: 'format'
          };
        }
        break;

      case 'pattern':
        if (typeof value === 'string' && rule.value) {
          const regex = new RegExp(rule.value);
          if (!regex.test(value)) {
            return {
              fieldId: field.id,
              fieldName: field.label,
              message: rule.message || `${field.label} format is invalid`,
              errorType: 'format'
            };
          }
        }
        break;

      case 'custom':
        if (rule.customValidator) {
          const isValid = this.executeCustomValidator(rule.customValidator, value, allData, field);
          if (!isValid) {
            return {
              fieldId: field.id,
              fieldName: field.label,
              message: rule.message || `${field.label} failed custom validation`,
              errorType: 'custom'
            };
          }
        }
        break;
    }

    return null;
  }

  /**
   * Validate backend limits (business rules)
   */
  private validateBackendLimits(field: FormField, value: any): FormValidationError[] {
    const errors: FormValidationError[] = [];

    // Common business rules based on field name/type
    if (field.name.toLowerCase().includes('age')) {
      const age = Number(value);
      if (age < 0 || age > 150) {
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Age must be between 0 and 150 years',
          errorType: 'range'
        });
      }
    }

    if (field.name.toLowerCase().includes('weight')) {
      const weight = Number(value);
      if (weight < 0 || weight > 1000) { // kg
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Weight must be between 0 and 1000 kg',
          errorType: 'range'
        });
      }
    }

    if (field.name.toLowerCase().includes('height')) {
      const height = Number(value);
      if (height < 0 || height > 300) { // cm
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Height must be between 0 and 300 cm',
          errorType: 'range'
        });
      }
    }

    if (field.name.toLowerCase().includes('temperature')) {
      const temp = Number(value);
      if (temp < 20 || temp > 50) { // Celsius
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Temperature must be between 20°C and 50°C',
          errorType: 'range'
        });
      }
    }

    if (field.name.toLowerCase().includes('bloodpressure') || field.name.toLowerCase().includes('bp')) {
      const bp = Number(value);
      if (bp < 50 || bp > 300) { // mmHg
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Blood pressure must be between 50 and 300 mmHg',
          errorType: 'range'
        });
      }
    }

    if (field.name.toLowerCase().includes('heartrate') || field.name.toLowerCase().includes('pulse')) {
      const hr = Number(value);
      if (hr < 30 || hr > 250) { // bpm
        errors.push({
          fieldId: field.id,
          fieldName: field.label,
          message: 'Heart rate must be between 30 and 250 bpm',
          errorType: 'range'
        });
      }
    }

    // Date validations
    if (field.type === 'date' || field.type === 'datetime') {
      const date = new Date(value);
      const now = new Date();
      
      if (field.name.toLowerCase().includes('birth')) {
        // Birth date should not be in the future and not more than 150 years ago
        const maxAge = new Date();
        maxAge.setFullYear(maxAge.getFullYear() - 150);
        
        if (date > now) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: 'Birth date cannot be in the future',
            errorType: 'range'
          });
        } else if (date < maxAge) {
          errors.push({
            fieldId: field.id,
            fieldName: field.label,
            message: 'Birth date cannot be more than 150 years ago',
            errorType: 'range'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Generate warnings for data quality issues
   */
  private generateFieldWarnings(
    field: FormField, 
    value: any, 
    allData: Record<string, any>
  ): FormValidationWarning[] {
    const warnings: FormValidationWarning[] = [];

    if (this.isEmpty(value) && !field.required) {
      warnings.push({
        fieldId: field.id,
        fieldName: field.label,
        message: `${field.label} is empty but may be important for data completeness`,
        warningType: 'missing_optional'
      });
    }

    // Unusual value warnings
    if (field.type === 'number' && typeof value === 'number') {
      if (field.name.toLowerCase().includes('age') && (value < 1 || value > 100)) {
        warnings.push({
          fieldId: field.id,
          fieldName: field.label,
          message: `Age of ${value} is unusual, please verify`,
          warningType: 'unusual_value'
        });
      }
    }

    return warnings;
  }

  /**
   * Validate cross-field business rules
   */
  private validateCrossFieldRules(
    template: FormTemplate, 
    data: Record<string, any>
  ): FormValidationError[] {
    const errors: FormValidationError[] = [];

    // Example: End date should be after start date
    const startDateField = template.fields.find(f => f.name.toLowerCase().includes('startdate') || f.name.toLowerCase().includes('start_date'));
    const endDateField = template.fields.find(f => f.name.toLowerCase().includes('enddate') || f.name.toLowerCase().includes('end_date'));
    
    if (startDateField && endDateField) {
      const startDate = new Date(data[startDateField.id]);
      const endDate = new Date(data[endDateField.id]);
      
      if (startDate && endDate && endDate < startDate) {
        errors.push({
          fieldId: endDateField.id,
          fieldName: endDateField.label,
          message: 'End date must be after start date',
          errorType: 'custom'
        });
      }
    }

    // Example: Systolic BP should be higher than Diastolic BP
    const systolicField = template.fields.find(f => f.name.toLowerCase().includes('systolic'));
    const diastolicField = template.fields.find(f => f.name.toLowerCase().includes('diastolic'));
    
    if (systolicField && diastolicField) {
      const systolic = Number(data[systolicField.id]);
      const diastolic = Number(data[diastolicField.id]);
      
      if (systolic && diastolic && systolic <= diastolic) {
        errors.push({
          fieldId: systolicField.id,
          fieldName: systolicField.label,
          message: 'Systolic pressure should be higher than diastolic pressure',
          errorType: 'custom'
        });
      }
    }

    return errors;
  }

  /**
   * Check if field should be shown based on conditional logic
   */
  private shouldShowField(field: FormField, data: Record<string, any>): boolean {
    if (!field.showWhen || field.showWhen.length === 0) {
      return true; // Show by default if no conditions
    }

    return field.showWhen.every(condition => 
      this.evaluateCondition(condition, data)
    );
  }

  /**
   * Check if field is required based on conditional logic
   */
  private isFieldRequired(field: FormField, data: Record<string, any>): boolean {
    if (!field.required) return false;

    if (!field.requiredWhen || field.requiredWhen.length === 0) {
      return field.required; // Use base required setting
    }

    return field.requiredWhen.every(condition => 
      this.evaluateCondition(condition, data)
    );
  }

  /**
   * Evaluate a conditional rule
   */
  private evaluateCondition(condition: ConditionalRule, data: Record<string, any>): boolean {
    const fieldValue = data[condition.fieldId];

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
      case 'not_empty':
        return !this.isEmpty(fieldValue);
      default:
        return false;
    }
  }

  /**
   * Execute custom validator function
   */
  private executeCustomValidator(
    validatorName: string, 
    value: any, 
    allData: Record<string, any>,
    field: FormField
  ): boolean {
    // This would typically load and execute custom validation functions
    // For now, return true as placeholder
    console.warn(`Custom validator '${validatorName}' not implemented`);
    return true;
  }

  // Utility methods
  private isEmpty(value: any): boolean {
    return value === null || value === undefined || value === '' || 
           (Array.isArray(value) && value.length === 0);
  }

  private isNumeric(value: any): boolean {
    return !isNaN(value) && !isNaN(parseFloat(value));
  }

  private isValidDate(value: any): boolean {
    if (!value) return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  }
}
