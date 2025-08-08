import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { Survey, SurveyQuestion, SurveyResponse, QuestionType } from '../../models/survey.model';
import { SurveyService } from '../../services/survey.service';
import { ToastService } from '../../services/toast.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-survey-response',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './survey-response.component.html',
  styleUrls: ['./survey-response.component.scss']
})
export class SurveyResponseComponent implements OnInit {
  @Input() survey!: Survey;
  @Input() isPreview: boolean = false;
  @Output() responseSubmitted = new EventEmitter<SurveyResponse>();
  @Output() responseCancelled = new EventEmitter<void>();

  responseForm!: FormGroup;
  currentQuestionIndex: number = 0;
  isSubmitting: boolean = false;
  startTime!: Date;
  currentUser: any = null;

  constructor(
    private fb: FormBuilder,
    private surveyService: SurveyService,
    private toastService: ToastService,
    private authService: EdcCompliantAuthService
  ) {}

  // Type assertion helper to avoid Angular template type checking issues
  asAny(value: any): any {
    return value;
  }

  async ngOnInit() {
    this.startTime = new Date();
    this.buildForm();
    
    // Get current user if authenticated
    try {
      const userProfile = await firstValueFrom(this.authService.currentUserProfile$);
      this.currentUser = userProfile;
    } catch (error) {
      console.log('User not authenticated, proceeding as anonymous');
    }
  }

  buildForm() {
    const formControls: any = {};
    
    this.survey.questions.forEach(question => {
      const validators = [];
      if (question.required) {
        validators.push(Validators.required);
      }
      
      // Add specific validators based on question type and validation rules
      if (question.validation) {
        if (question.type === 'text' || question.type === 'textarea') {
          if (question.validation.minLength) {
            validators.push(Validators.minLength(question.validation.minLength));
          }
          if (question.validation.maxLength) {
            validators.push(Validators.maxLength(question.validation.maxLength));
          }
          if (question.validation.pattern) {
            validators.push(Validators.pattern(question.validation.pattern));
          }
        }
        
        if (question.type === 'number') {
          if (question.validation.minValue !== undefined) {
            validators.push(Validators.min(question.validation.minValue));
          }
          if (question.validation.maxValue !== undefined) {
            validators.push(Validators.max(question.validation.maxValue));
          }
        }
      }
      
      // Initialize form control based on question type
      if (question.type === 'multiple-choice') {
        // For multiple choice, create a FormArray
        const optionControls = question.options?.map(() => false) || [];
        formControls[question.id] = this.fb.array(optionControls);
      } else {
        formControls[question.id] = ['', validators];
      }
    });
    
    this.responseForm = this.fb.group(formControls);
  }

  getFormControl(questionId: string) {
    return this.responseForm.get(questionId);
  }

  getFormArray(questionId: string): FormArray {
    return this.responseForm.get(questionId) as FormArray;
  }

  onMultipleChoiceChange(questionId: string, optionIndex: number, event: Event) {
    const target = event.target as HTMLInputElement;
    const formArray = this.getFormArray(questionId);
    formArray.at(optionIndex).setValue(target.checked);
  }

  isQuestionValid(question: SurveyQuestion): boolean {
    const control = this.getFormControl(question.id);
    return control ? control.valid || !control.touched : true;
  }

  getQuestionError(question: SurveyQuestion): string {
    const control = this.getFormControl(question.id);
    if (!control || !control.errors || !control.touched) return '';
    
    if (control.errors['required']) return `${question.text} is required`;
    if (control.errors['minlength']) return `Minimum length is ${question.validation?.minLength}`;
    if (control.errors['maxlength']) return `Maximum length is ${question.validation?.maxLength}`;
    if (control.errors['min']) return `Minimum value is ${question.validation?.minValue}`;
    if (control.errors['max']) return `Maximum value is ${question.validation?.maxValue}`;
    if (control.errors['pattern']) return question.validation?.customMessage || 'Invalid format';
    
    return 'Invalid input';
  }

  nextQuestion() {
    if (this.currentQuestionIndex < this.survey.questions.length - 1) {
      this.currentQuestionIndex++;
    }
  }

  previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
    }
  }

  goToQuestion(index: number) {
    this.currentQuestionIndex = index;
  }

  async submitResponse() {
    if (this.responseForm.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.responseForm.controls).forEach(key => {
        this.responseForm.get(key)?.markAsTouched();
      });
      this.toastService.error('Please complete all required fields');
      return;
    }
    
    this.isSubmitting = true;
    
    try {
      // Prepare response data
      const answers: { [questionId: string]: any } = {};
      
      this.survey.questions.forEach(question => {
        const control = this.getFormControl(question.id);
        if (control) {
          if (question.type === 'multiple-choice') {
            // For multiple choice, get selected options
            const formArray = control as FormArray;
            const selectedOptions: string[] = [];
            formArray.controls.forEach((ctrl, index) => {
              if (ctrl.value && question.options?.[index]) {
                selectedOptions.push(question.options[index].value);
              }
            });
            answers[question.id] = selectedOptions;
          } else {
            answers[question.id] = control.value;
          }
        }
      });
      
      const completionTime = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
      
      const response: SurveyResponse = {
        surveyId: this.survey.id!,
        respondentId: this.currentUser?.uid || undefined,
        respondentType: this.currentUser ? 'staff' : 'anonymous',
        answers,
        startedAt: this.startTime,
        completedAt: new Date(),
        isComplete: true,
        completionTimeSeconds: completionTime,
        contextData: {
          userAgent: navigator.userAgent,
          pageUrl: window.location.href
        }
      };
      
      if (!this.isPreview) {
        // Save to Firebase
        await this.surveyService.submitResponse(response);
        this.toastService.success('Survey response submitted successfully!');
      } else {
        this.toastService.info('Preview mode - response not saved');
      }
      
      this.responseSubmitted.emit(response);
    } catch (error) {
      console.error('Error submitting survey response:', error);
      this.toastService.error('Failed to submit survey response');
    } finally {
      this.isSubmitting = false;
    }
  }

  cancel() {
    this.responseCancelled.emit();
  }

  onFileSelected(event: any, questionId: string) {
    const file = event.target.files[0];
    if (file) {
      // For now, just store the filename. In a real implementation,
      // you would upload the file to storage and store the URL
      this.getFormControl(questionId)?.setValue(file.name);
    }
  }

  getProgressPercentage(): number {
    const answeredQuestions = this.survey.questions.filter(q => {
      const control = this.getFormControl(q.id);
      return control && control.value !== '' && control.value !== null;
    }).length;
    
    return Math.round((answeredQuestions / this.survey.questions.length) * 100);
  }
}
