import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Survey, SurveyQuestion, SurveyResponse } from '../../models/survey.model';
import { SurveyService } from '../../services/survey.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-survey-popup',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './survey-popup.component.html',
  styleUrls: ['./survey-popup.component.scss']
})
export class SurveyPopupComponent implements OnInit {
  @Input() survey!: Survey;
  @Input() context?: any;
  @Output() close = new EventEmitter<void>();
  @Output() complete = new EventEmitter<SurveyResponse>();
  
  form!: FormGroup;
  currentQuestionIndex = 0;
  showWelcome = true;
  showThankYou = false;
  isSubmitting = false;
  startTime!: Date;
  Math = Math; // For template access
  
  // Progress tracking
  answeredQuestions = new Set<string>();
  
  constructor(
    private fb: FormBuilder,
    private surveyService: SurveyService,
    private authService: EdcCompliantAuthService,
    private toastService: ToastService
  ) {}
  
  ngOnInit() {
    this.initializeForm();
    this.startTime = new Date();
  }
  
  initializeForm() {
    const group: any = {};
    
    this.survey.questions.forEach(question => {
      const validators = question.required ? [Validators.required] : [];
      
      // Add type-specific validators
      if (question.validation) {
        if (question.validation.minLength) {
          validators.push(Validators.minLength(question.validation.minLength));
        }
        if (question.validation.maxLength) {
          validators.push(Validators.maxLength(question.validation.maxLength));
        }
        if (question.validation.pattern) {
          validators.push(Validators.pattern(question.validation.pattern));
        }
        if (question.validation.minValue !== undefined) {
          validators.push(Validators.min(question.validation.minValue));
        }
        if (question.validation.maxValue !== undefined) {
          validators.push(Validators.max(question.validation.maxValue));
        }
      }
      
      // Initialize with appropriate default value
      let defaultValue: any = '';
      if (question.type === 'multiple-choice') {
        defaultValue = [];
      } else if (question.type === 'rating' || question.type === 'scale' || question.type === 'nps') {
        defaultValue = null;
      }
      
      group[question.id] = [defaultValue, validators];
    });
    
    this.form = this.fb.group(group);
  }
  
  get currentQuestion(): SurveyQuestion | null {
    if (this.showWelcome || this.showThankYou) return null;
    return this.survey.questions[this.currentQuestionIndex] || null;
  }
  
  get visibleQuestions(): SurveyQuestion[] {
    return this.survey.questions.filter(q => this.isQuestionVisible(q));
  }
  
  get progress(): number {
    const visibleCount = this.visibleQuestions.length;
    if (visibleCount === 0) return 100;
    return Math.round((this.answeredQuestions.size / visibleCount) * 100);
  }
  
  isQuestionVisible(question: SurveyQuestion): boolean {
    if (!question.showIf) return true;
    
    const { questionId, operator, value } = question.showIf;
    const answer = this.form.get(questionId)?.value;
    
    switch (operator) {
      case 'equals':
        return answer === value;
      case 'not-equals':
        return answer !== value;
      case 'contains':
        return Array.isArray(answer) ? answer.includes(value) : 
               String(answer).includes(String(value));
      case 'greater-than':
        return Number(answer) > Number(value);
      case 'less-than':
        return Number(answer) < Number(value);
      default:
        return true;
    }
  }
  
  startSurvey() {
    this.showWelcome = false;
    this.moveToFirstVisibleQuestion();
  }
  
  moveToFirstVisibleQuestion() {
    for (let i = 0; i < this.survey.questions.length; i++) {
      if (this.isQuestionVisible(this.survey.questions[i])) {
        this.currentQuestionIndex = i;
        break;
      }
    }
  }
  
  nextQuestion() {
    if (!this.validateCurrentQuestion()) return;
    
    // Mark current question as answered
    if (this.currentQuestion) {
      this.answeredQuestions.add(this.currentQuestion.id);
    }
    
    // Find next visible question
    for (let i = this.currentQuestionIndex + 1; i < this.survey.questions.length; i++) {
      if (this.isQuestionVisible(this.survey.questions[i])) {
        this.currentQuestionIndex = i;
        return;
      }
    }
    
    // No more questions, submit
    this.submitSurvey();
  }
  
  previousQuestion() {
    // Find previous visible question
    for (let i = this.currentQuestionIndex - 1; i >= 0; i--) {
      if (this.isQuestionVisible(this.survey.questions[i])) {
        this.currentQuestionIndex = i;
        return;
      }
    }
    
    // Back to welcome
    this.showWelcome = true;
  }
  
  validateCurrentQuestion(): boolean {
    if (!this.currentQuestion) return true;
    
    const control = this.form.get(this.currentQuestion.id);
    if (!control) return true;
    
    control.markAsTouched();
    control.updateValueAndValidity();
    
    if (control.invalid) {
      const validationMessage = this.currentQuestion.validation?.customMessage || 
                               'Please provide a valid answer';
      this.toastService.error(validationMessage);
      return false;
    }
    
    return true;
  }
  
  async submitSurvey() {
    if (this.isSubmitting) return;
    
    // Validate all visible questions
    const visibleQuestions = this.visibleQuestions;
    for (const question of visibleQuestions) {
      const control = this.form.get(question.id);
      if (control) {
        control.markAsTouched();
        control.updateValueAndValidity();
        if (control.invalid && question.required) {
          this.toastService.error(`Please complete all required questions`);
          // Navigate to first invalid question
          const index = this.survey.questions.indexOf(question);
          if (index >= 0) {
            this.currentQuestionIndex = index;
          }
          return;
        }
      }
    }
    
    this.isSubmitting = true;
    
    try {
      const currentUserProfile = await this.authService.getCurrentUserProfile();
      const completionTime = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
      
      // Filter out answers for non-visible questions
      const answers: { [key: string]: any } = {};
      visibleQuestions.forEach(question => {
        const value = this.form.get(question.id)?.value;
        if (value !== null && value !== undefined && value !== '') {
          answers[question.id] = value;
        }
      });
      
      const response: Omit<SurveyResponse, 'id' | 'startedAt'> = {
        surveyId: this.survey.id!,
        respondentId: currentUserProfile?.uid,
        respondentType: currentUserProfile ? 'staff' : 'anonymous',
        answers,
        isComplete: true,
        completionTimeSeconds: completionTime,
        contextData: {
          ...this.context,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent
        },
        deviceType: this.getDeviceType(),
        browser: this.getBrowserName()
      };
      
      const savedResponse = await this.surveyService.submitResponse(response);
      
      this.showThankYou = true;
      this.complete.emit(savedResponse);
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        this.close.emit();
      }, 3000);
      
    } catch (error) {
      console.error('Error submitting survey:', error);
      this.toastService.error('Failed to submit survey. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }
  
  skipQuestion() {
    if (this.currentQuestion && !this.currentQuestion.required) {
      this.nextQuestion();
    }
  }
  
  closeSurvey() {
    if (this.progress > 0 && !this.showThankYou) {
      if (confirm('Are you sure you want to close this survey? Your progress will be lost.')) {
        this.close.emit();
      }
    } else {
      this.close.emit();
    }
  }
  
  // Helper methods
  private getDeviceType(): string {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      return 'mobile';
    }
    return 'desktop';
  }
  
  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf('Firefox') > -1) return 'Firefox';
    if (userAgent.indexOf('Chrome') > -1) return 'Chrome';
    if (userAgent.indexOf('Safari') > -1) return 'Safari';
    if (userAgent.indexOf('Edge') > -1) return 'Edge';
    if (userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1) return 'Opera';
    return 'Unknown';
  }
  
  // Question-specific methods
  getRatingOptions(max: number = 5): number[] {
    return Array.from({ length: max }, (_, i) => i + 1);
  }
  
  getNPSOptions(): number[] {
    return Array.from({ length: 11 }, (_, i) => i);
  }
  
  getScaleOptions(min: number = 1, max: number = 10): number[] {
    return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  }
  
  onMultipleChoiceChange(event: Event, questionId: string, optionId: string) {
    const checkbox = event.target as HTMLInputElement;
    const currentValue = this.form.get(questionId)?.value || [];
    
    if (checkbox.checked) {
      // Add option
      this.form.get(questionId)?.setValue([...currentValue, optionId]);
    } else {
      // Remove option
      this.form.get(questionId)?.setValue(
        currentValue.filter((id: string) => id !== optionId)
      );
    }
  }
}
