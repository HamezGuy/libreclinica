import { Injectable } from '@angular/core';
import { 
  IOcrTemplateBuilder,
  OcrFormElement,
  OcrBoundingBox
} from '../../interfaces/ocr-interfaces';
import { FormField, FormFieldType, ValidationRule } from '../../models/form-template.model';

@Injectable({
  providedIn: 'root'
})
export class OcrTemplateBuilderService implements IOcrTemplateBuilder {
  
  buildFields(elements: OcrFormElement[]): FormField[] {
    const fields: FormField[] = [];
    const relationships = this.detectFieldRelationships(elements);
    const groups = this.groupRelatedElements(elements);
    
    // Process grouped elements (like radio button groups)
    groups.forEach((group, index) => {
      if (group.length > 1 && this.isRadioOrCheckboxGroup(group)) {
        const field = this.createGroupedField(group, index);
        if (field) {
          fields.push(field);
        }
      }
    });
    
    // Process individual elements
    elements.forEach((element, index) => {
      // Skip if already processed as part of a group
      if (this.isPartOfProcessedGroup(element, groups)) {
        return;
      }
      
      const relatedLabelId = this.findRelatedLabel(element, relationships);
      const relatedLabel = relatedLabelId ? 
        elements.find(e => e.id === relatedLabelId) : null;
      
      const field = this.createFieldFromElement(
        element, 
        index, 
        relatedLabel || null,
        elements
      );
      
      if (field) {
        fields.push(field);
      }
    });
    
    // Sort fields by position
    return this.sortFieldsByPosition(fields, elements);
  }

  detectFieldRelationships(elements: OcrFormElement[]): Map<string, string> {
    const relationships = new Map<string, string>();
    
    elements.forEach(element => {
      if (element.type === 'label') {
        // Find the nearest input element to the right or below
        const nearestInput = this.findNearestInput(element, elements);
        if (nearestInput) {
          relationships.set(nearestInput.id, element.id);
        }
      }
    });
    
    return relationships;
  }

  inferFieldType(element: OcrFormElement, relatedElements: OcrFormElement[]): string {
    const text = element.text.toLowerCase();
    
    // Check for specific patterns
    if (text.includes('email')) return 'email';
    if (text.includes('phone') || text.includes('tel')) return 'tel';
    if (text.includes('date') || text.includes('dob')) return 'date';
    if (text.includes('time')) return 'time';
    if (text.includes('number') || text.includes('#')) return 'number';
    if (text.includes('age') || text.includes('weight') || text.includes('height')) return 'number';
    
    // Check for medical field types
    if (text.includes('temperature')) return 'temperature';
    if (text.includes('blood pressure') || text.includes('bp')) return 'blood_pressure';
    if (text.includes('diagnosis')) return 'diagnosis';
    if (text.includes('medication')) return 'medication';
    
    // Check element type
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    if (element.type === 'select') return 'select';
    
    // Check for multi-line indicators
    if (text.includes('comments') || text.includes('notes') || text.includes('description')) {
      return 'textarea';
    }
    
    // Default to text
    return 'text';
  }

  groupRelatedElements(elements: OcrFormElement[]): OcrFormElement[][] {
    const groups: OcrFormElement[][] = [];
    const processed = new Set<string>();
    
    elements.forEach(element => {
      if (processed.has(element.id)) return;
      
      if (element.type === 'checkbox' || element.type === 'radio') {
        const group = this.findRelatedCheckboxesOrRadios(element, elements);
        if (group.length > 1) {
          groups.push(group);
          group.forEach(e => processed.add(e.id));
        }
      }
    });
    
    return groups;
  }

  extractValidationRules(element: OcrFormElement): any {
    const rules: ValidationRule[] = [];
    const text = element.text.toLowerCase();
    
    // Check for required indicators
    if (text.includes('*') || text.includes('required') || text.includes('mandatory')) {
      rules.push({ type: 'required', value: true, message: 'This field is required' });
    }
    
    // Extract length constraints
    const minMatch = text.match(/min[imum]*\s*[:=]?\s*(\d+)/);
    if (minMatch) {
      rules.push({ type: 'minLength', value: parseInt(minMatch[1]), message: `Minimum length is ${minMatch[1]}` });
    }
    
    const maxMatch = text.match(/max[imum]*\s*[:=]?\s*(\d+)/);
    if (maxMatch) {
      rules.push({ type: 'maxLength', value: parseInt(maxMatch[1]), message: `Maximum length is ${maxMatch[1]}` });
    }
    
    // Extract numeric constraints
    const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
      rules.push({ type: 'min', value: parseInt(rangeMatch[1]), message: `Minimum value is ${rangeMatch[1]}` });
      rules.push({ type: 'max', value: parseInt(rangeMatch[2]), message: `Maximum value is ${rangeMatch[2]}` });
    }
    
    // Pattern detection
    if (text.includes('email')) {
      rules.push({ type: 'pattern', value: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', message: 'Please enter a valid email address' });
    }
    
    return rules;
  }

  private createFieldFromElement(
    element: OcrFormElement,
    index: number,
    relatedLabel: OcrFormElement | null,
    allElements: OcrFormElement[]
  ): FormField | null {
    // Skip pure label elements
    if (element.type === 'label' && !relatedLabel) {
      return null;
    }
    
    const label = relatedLabel?.text || element.text || `Field ${index + 1}`;
    const fieldType = this.inferFieldType(element, allElements) as FormFieldType;
    const validationRules = this.extractValidationRules(relatedLabel || element);
    
    const field: FormField = {
      id: `field_${index + 1}`,
      name: this.sanitizeFieldName(label),
      label: label,
      type: fieldType,
      required: validationRules.some((rule: ValidationRule) => rule.type === 'required' && rule.value),
      placeholder: '',
      helpText: '',
      validationRules: validationRules,
      readonly: false,
      hidden: false,
      defaultValue: '',
      options: element.options ? element.options.map(opt => ({ value: opt, label: opt })) : [],
      isPhiField: false,
      auditRequired: false,
      order: index
    };
    
    // Add specific settings based on field type
    if (fieldType === 'number' || fieldType === 'temperature') {
      field.min = validationRules.find((rule: ValidationRule) => rule.type === 'min')?.value;
      field.max = validationRules.find((rule: ValidationRule) => rule.type === 'max')?.value;
    }
    
    return field;
  }

  private createGroupedField(group: OcrFormElement[], index: number): FormField | null {
    if (group.length === 0) return null;
    
    const firstElement = group[0];
    const isRadio = firstElement.type === 'radio';
    
    // Find common label for the group
    const commonLabel = this.findCommonLabel(group) || `${isRadio ? 'Select' : 'Choose'} Option`;
    
    const options = group.map(element => {
      const nearbyText = this.findNearbyText(element, group);
      return {
        value: this.sanitizeFieldName(nearbyText),
        label: nearbyText
      };
    });
    
    return {
      id: `field_group_${index + 1}`,
      name: this.sanitizeFieldName(commonLabel),
      label: commonLabel,
      type: isRadio ? 'radio' : 'multiselect',
      required: false,
      placeholder: '',
      helpText: '',
      validationRules: [],
      readonly: false,
      hidden: false,
      defaultValue: isRadio ? '' : [],
      options: options,
      isPhiField: false,
      auditRequired: false,
      order: index
    };
  }

  private findNearestInput(label: OcrFormElement, elements: OcrFormElement[]): OcrFormElement | null {
    const inputTypes = ['input', 'checkbox', 'radio', 'select'];
    const inputs = elements.filter(e => inputTypes.includes(e.type));
    
    let nearest: OcrFormElement | null = null;
    let minDistance = Infinity;
    
    inputs.forEach(input => {
      const distance = this.calculateDistance(label.boundingBox, input.boundingBox);
      if (distance < minDistance && this.isToRightOrBelow(label.boundingBox, input.boundingBox)) {
        minDistance = distance;
        nearest = input;
      }
    });
    
    return minDistance < 0.2 ? nearest : null; // Threshold for proximity
  }

  private findRelatedCheckboxesOrRadios(
    element: OcrFormElement, 
    elements: OcrFormElement[]
  ): OcrFormElement[] {
    const related = [element];
    const threshold = 0.1; // Vertical distance threshold
    
    elements.forEach(other => {
      if (other.id === element.id) return;
      if (other.type !== element.type) return;
      
      // Check if vertically aligned and close
      const xDiff = Math.abs(element.boundingBox.left - other.boundingBox.left);
      const yDiff = Math.abs(element.boundingBox.top - other.boundingBox.top);
      
      if (xDiff < 0.05 && yDiff < threshold) {
        related.push(other);
      }
    });
    
    return related.sort((a, b) => a.boundingBox.top - b.boundingBox.top);
  }

  private findRelatedLabel(
    element: OcrFormElement, 
    relationships: Map<string, string>
  ): string | undefined {
    return relationships.get(element.id);
  }

  private isRadioOrCheckboxGroup(group: OcrFormElement[]): boolean {
    return group.length > 1 && 
           group.every(e => e.type === 'radio' || e.type === 'checkbox');
  }

  private isPartOfProcessedGroup(
    element: OcrFormElement, 
    groups: OcrFormElement[][]
  ): boolean {
    return groups.some(group => group.some(e => e.id === element.id));
  }

  private findCommonLabel(group: OcrFormElement[]): string {
    // Logic to find common label above the group
    // This is simplified - real implementation would be more sophisticated
    return '';
  }

  private findNearbyText(element: OcrFormElement, allElements: OcrFormElement[]): string {
    // Find text element to the right of this checkbox/radio
    let nearestText = '';
    let minDistance = Infinity;
    
    allElements.forEach(other => {
      if (other.type === 'text' || other.type === 'label') {
        const distance = this.calculateDistance(element.boundingBox, other.boundingBox);
        if (distance < minDistance && this.isToRight(element.boundingBox, other.boundingBox)) {
          minDistance = distance;
          nearestText = other.text;
        }
      }
    });
    
    return nearestText || 'Option';
  }

  private calculateDistance(box1: OcrBoundingBox, box2: OcrBoundingBox): number {
    const centerX1 = box1.left + box1.width / 2;
    const centerY1 = box1.top + box1.height / 2;
    const centerX2 = box2.left + box2.width / 2;
    const centerY2 = box2.top + box2.height / 2;
    
    return Math.sqrt(
      Math.pow(centerX2 - centerX1, 2) + 
      Math.pow(centerY2 - centerY1, 2)
    );
  }

  private isToRightOrBelow(box1: OcrBoundingBox, box2: OcrBoundingBox): boolean {
    return box2.left >= box1.left || box2.top >= box1.top;
  }

  private isToRight(box1: OcrBoundingBox, box2: OcrBoundingBox): boolean {
    return box2.left > box1.left + box1.width;
  }

  private sanitizeFieldName(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private sortFieldsByPosition(
    fields: FormField[], 
    elements: OcrFormElement[]
  ): FormField[] {
    return fields.sort((a, b) => a.order - b.order);
  }
}
