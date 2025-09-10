import { FieldBaseDto } from '../base/field-base.dto';
import { ValidatorFn } from '@angular/forms';

/**
 * DTO for nested form fields that can contain other form templates
 */
export class NestedFormFieldDto extends FieldBaseDto {
  nestedTemplateId?: string; // Reference to another form template
  allowMultiple: boolean = false; // Allow multiple instances of the nested form
  minInstances?: number; // Minimum number of instances (if allowMultiple)
  maxInstances?: number; // Maximum number of instances (if allowMultiple)
  collapsible: boolean = true; // Whether the nested form can be collapsed
  defaultExpanded: boolean = false; // Whether to expand by default
  showBorder: boolean = true; // Whether to show a border around the nested form
  inheritParentData: boolean = false; // Whether to inherit data from parent form
  
  constructor(data: Partial<NestedFormFieldDto> = {}) {
    super({
      ...data,
      type: data.type || 'nested_form'
    });
    
    this.nestedTemplateId = data.nestedTemplateId;
    this.allowMultiple = data.allowMultiple ?? false;
    this.minInstances = data.minInstances;
    this.maxInstances = data.maxInstances;
    this.collapsible = data.collapsible ?? true;
    this.defaultExpanded = data.defaultExpanded ?? false;
    this.showBorder = data.showBorder ?? true;
    this.inheritParentData = data.inheritParentData ?? false;
  }

  /**
   * Get Angular validators for nested form
   */
  toAngularValidators(): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    
    // Add validators from base validation DTO
    if (this.validation) {
      validators.push(...this.validation.toAngularValidators());
    }
    
    // Add nested form specific validators if needed
    if (this.allowMultiple && this.minInstances && this.minInstances > 0) {
      // Custom validator for minimum instances would go here
    }
    
    return validators;
  }

  /**
   * Validate nested form field
   */
  validate(): boolean {
    // Basic validation - check if nested template is set when required
    if (this.validation?.required && !this.nestedTemplateId) {
      return false;
    }
    return true;
  }

  /**
   * Validate nested form field value
   */
  validateValue(value: any): string[] {
    const errors: string[] = [];
    
    // Validate base requirements
    if (this.validation?.required && (!value || (Array.isArray(value) && value.length === 0))) {
      errors.push(`${this.display?.label || this.name} is required`);
    }
    
    // Validate instance count if multiple allowed
    if (this.allowMultiple && Array.isArray(value)) {
      if (this.minInstances && value.length < this.minInstances) {
        errors.push(`At least ${this.minInstances} instance(s) required`);
      }
      if (this.maxInstances && value.length > this.maxInstances) {
        errors.push(`Maximum ${this.maxInstances} instance(s) allowed`);
      }
    }
    
    return errors;
  }

  /**
   * Clone the nested form field DTO
   */
  clone(): FieldBaseDto {
    return new NestedFormFieldDto(this.toJSON());
  }

  /**
   * Convert to JSON
   */
  toJSON(): any {
    return {
      ...this.toJSONBase(),
      nestedTemplateId: this.nestedTemplateId,
      allowMultiple: this.allowMultiple,
      minInstances: this.minInstances,
      maxInstances: this.maxInstances,
      collapsible: this.collapsible,
      defaultExpanded: this.defaultExpanded,
      showBorder: this.showBorder,
      inheritParentData: this.inheritParentData
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: any): NestedFormFieldDto {
    return new NestedFormFieldDto(json);
  }
}
