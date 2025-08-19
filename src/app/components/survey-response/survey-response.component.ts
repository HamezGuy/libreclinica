import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { 
  Survey, 
  SurveyQuestion, 
  SurveyResponse,
  BranchingRule,
  BranchAction,
  VisibilityCondition
} from '../../models/survey.model';
import { SurveyService } from '../../services/survey.service';
import { ToastService } from '../../services/toast.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-survey-response',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './survey-response.component.html',
  styleUrls: ['./survey-response.component.scss']
})
export class SurveyResponseComponent implements OnInit {
  @Input() survey!: Survey;
  @Input() isPreview: boolean = false;
  @Output() responseSubmitted = new EventEmitter<SurveyResponse>();
  @Output() responseCancelled = new EventEmitter<void>();

  responseForm!: FormGroup;
  currentQuestionIndex = 0;
  isSubmitting = false;
  visibleQuestions: SurveyQuestion[] = [];
  questionHistory: number[] = [];
  branchingMessage: string | null = null;
  surveyEnded = false;
  currentUser: any = null;
  startTime!: Date;

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
    this.updateVisibleQuestions();
    this.subscribeToFormChanges();

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
      const validators: any[] = [];
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
      switch (question.type) {
        case 'multiple-choice':
          // For multiple choice, create a FormArray for checkboxes
          if (question.options && question.options.length > 0) {
            const optionControls = question.options.map(() => this.fb.control(false));
            formControls[question.id] = this.fb.array(optionControls, question.required ? this.requireAtLeastOne : null);
          } else {
            // If no options, create empty FormArray
            formControls[question.id] = this.fb.array([], question.required ? this.requireAtLeastOne : null);
          }
          break;
          
        case 'combobox':
          // For combobox (multi-select), store array of selected values
          formControls[question.id] = this.fb.control([], validators);
          break;
          
        case 'matrix':
          // For matrix questions, create nested FormGroup
          const matrixControls: any = {};
          if (question.matrixRows && question.matrixColumns) {
            question.matrixRows.forEach(row => {
              matrixControls[row.id] = this.fb.control('', validators);
            });
          }
          formControls[question.id] = this.fb.group(matrixControls);
          break;
          
        case 'ranking':
          // For ranking questions, create a FormArray with initial order
          if (question.options && question.options.length > 0) {
            const rankingControls = question.options.map((option, index) => 
              this.fb.control({ id: option.id, order: index + 1 })
            );
            formControls[question.id] = this.fb.array(rankingControls);
          } else {
            formControls[question.id] = this.fb.array([]);
          }
          break;
          
        case 'rating':
        case 'scale':
        case 'nps':
          // For rating/scale/nps questions, initialize with null
          formControls[question.id] = this.fb.control(null, validators);
          break;
          
        case 'single-choice':
        case 'text':
        case 'textarea':
        case 'number':
        case 'date':
        default:
          // For all other types, use simple form control
          formControls[question.id] = this.fb.control('', validators);
          break;
      }
    });
    
    this.responseForm = this.fb.group(formControls);
  }

  // Custom validator for requiring at least one checkbox
  requireAtLeastOne = (control: AbstractControl): {[key: string]: any} | null => {
    const formArray = control as FormArray;
    const selected = formArray.controls.some(ctrl => ctrl.value === true);
    return selected ? null : { requireAtLeastOne: true };
  }

  getFormControl(questionId: string) {
    return this.responseForm.get(questionId);
  }

  getFormArray(questionId: string): FormArray {
    const control = this.responseForm.get(questionId);
    if (control instanceof FormArray) {
      return control;
    }
    // Return an empty FormArray if control doesn't exist or isn't a FormArray
    return this.fb.array([]);
  }

  onMultipleChoiceChange(questionId: string, optionIndex: number, event: Event) {
    const target = event.target as HTMLInputElement;
    const formArray = this.getFormArray(questionId);
    if (formArray && formArray.at(optionIndex)) {
      formArray.at(optionIndex).setValue(target.checked);
    }
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

  subscribeToFormChanges() {
    // Subscribe to form value changes to update visibility and branching
    this.responseForm.valueChanges.subscribe(() => {
      this.updateVisibleQuestions();
    });
  }

  updateVisibleQuestions() {
    this.visibleQuestions = this.survey.questions.filter(q => this.isQuestionVisible(q));
  }

  isQuestionVisible(question: SurveyQuestion): boolean {
    // Check visibility conditions
    if (!question.visibilityConditions || question.visibilityConditions.length === 0) {
      return true;
    }
    
    // Evaluate all visibility conditions (using AND logic)
    return question.visibilityConditions.every(condition => 
      this.evaluateCondition(condition)
    );
  }

  evaluateCondition(condition: VisibilityCondition | any): boolean {
    const answer = this.responseForm.get(condition.questionId)?.value;
    
    switch (condition.operator) {
      case 'equals':
        return answer === condition.value;
      case 'not-equals':
        return answer !== condition.value;
      case 'contains':
        return Array.isArray(answer) ? answer.includes(condition.value) : 
               String(answer).includes(String(condition.value));
      case 'not-contains':
        return Array.isArray(answer) ? !answer.includes(condition.value) : 
               !String(answer).includes(String(condition.value));
      case 'greater-than':
        return Number(answer) > Number(condition.value);
      case 'less-than':
        return Number(answer) < Number(condition.value);
      case 'greater-than-or-equal':
        return Number(answer) >= Number(condition.value);
      case 'less-than-or-equal':
        return Number(answer) <= Number(condition.value);
      case 'is-answered':
        return answer !== null && answer !== undefined && answer !== '';
      case 'is-not-answered':
        return answer === null || answer === undefined || answer === '';
      case 'selected':
        return Array.isArray(answer) ? answer.includes(condition.optionId) : 
               answer === condition.optionId;
      case 'not-selected':
        return Array.isArray(answer) ? !answer.includes(condition.optionId) : 
               answer !== condition.optionId;
      default:
        return true;
    }
  }

  processBranchingLogic(question: SurveyQuestion): BranchAction | null {
    if (!question.branchingLogic || question.branchingLogic.length === 0) {
      return null;
    }

    // Find the first matching branching rule
    for (const rule of question.branchingLogic) {
      if (!rule.enabled) continue;

      const conditionsMatch = rule.conditionLogic === 'all'
        ? rule.conditions.every(c => this.evaluateCondition(c))
        : rule.conditions.some(c => this.evaluateCondition(c));

      if (conditionsMatch) {
        return rule.action;
      }
    }

    return null;
  }

  nextQuestion() {
    const currentQuestion = this.survey.questions[this.currentQuestionIndex];
    
    // Check if current question has branching logic
    const branchAction = this.processBranchingLogic(currentQuestion);
    
    if (branchAction) {
      this.handleBranchAction(branchAction);
    } else {
      // Normal flow: move to next visible question
      this.moveToNextVisibleQuestion();
    }
  }

  handleBranchAction(action: BranchAction) {
    switch (action.type) {
      case 'skip-to-question':
        if (action.target?.questionId) {
          const targetIndex = this.survey.questions.findIndex(
            q => q.id === action.target?.questionId
          );
          if (targetIndex !== -1) {
            this.questionHistory.push(this.currentQuestionIndex);
            this.currentQuestionIndex = targetIndex;
          } else {
            this.moveToNextVisibleQuestion();
          }
        }
        break;
        
      case 'skip-to-end':
        this.questionHistory.push(this.currentQuestionIndex);
        this.currentQuestionIndex = this.survey.questions.length;
        break;
        
      case 'end-survey':
        this.surveyEnded = true;
        this.branchingMessage = action.message || 'Thank you for your response.';
        break;
        
      case 'show-message':
        this.branchingMessage = action.message || '';
        this.moveToNextVisibleQuestion();
        break;
        
      default:
        this.moveToNextVisibleQuestion();
    }
  }

  moveToNextVisibleQuestion() {
    this.questionHistory.push(this.currentQuestionIndex);
    
    let nextIndex = this.currentQuestionIndex + 1;
    while (nextIndex < this.survey.questions.length) {
      if (this.isQuestionVisible(this.survey.questions[nextIndex])) {
        this.currentQuestionIndex = nextIndex;
        return;
      }
      nextIndex++;
    }
    
    // No more visible questions
    this.currentQuestionIndex = this.survey.questions.length;
  }

  previousQuestion() {
    if (this.questionHistory.length > 0) {
      this.currentQuestionIndex = this.questionHistory.pop()!;
      this.branchingMessage = null;
      this.surveyEnded = false;
    }
  }

  goToQuestion(index: number) {
    if (this.isQuestionVisible(this.survey.questions[index])) {
      this.questionHistory.push(this.currentQuestionIndex);
      this.currentQuestionIndex = index;
    }
  }

  get currentQuestion(): SurveyQuestion | null {
    if (this.surveyEnded || this.currentQuestionIndex >= this.survey.questions.length) {
      return null;
    }
    return this.survey.questions[this.currentQuestionIndex];
  }

  get isLastQuestion(): boolean {
    if (this.surveyEnded) return true;
    
    // Check if there are any more visible questions after current
    for (let i = this.currentQuestionIndex + 1; i < this.survey.questions.length; i++) {
      if (this.isQuestionVisible(this.survey.questions[i])) {
        return false;
      }
    }
    return true;
  }

  get canGoBack(): boolean {
    return this.questionHistory.length > 0;
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
          } else if (question.type === 'matrix') {
            // For matrix questions, get all row responses
            const matrixGroup = control as FormGroup;
            const matrixAnswers: { [rowId: string]: any } = {};
            Object.keys(matrixGroup.controls).forEach(rowId => {
              matrixAnswers[rowId] = matrixGroup.get(rowId)?.value;
            });
            answers[question.id] = matrixAnswers;
          } else if (question.type === 'ranking') {
            // For ranking questions, get the ordered array
            const rankingArray = control as FormArray;
            const rankings: number[] = [];
            rankingArray.controls.forEach(ctrl => {
              rankings.push(ctrl.value);
            });
            answers[question.id] = rankings;
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

  // Matrix question helpers
  onMatrixChange(questionId: string, rowId: string, value: any) {
    const matrixGroup = this.getFormControl(questionId) as FormGroup;
    if (matrixGroup) {
      matrixGroup.get(rowId)?.setValue(value);
    }
  }

  getMatrixValue(questionId: string, rowId: string): any {
    const matrixGroup = this.getFormControl(questionId) as FormGroup;
    return matrixGroup?.get(rowId)?.value;
  }

  // Ranking question helpers
  getRankingOptions(question: SurveyQuestion): any[] {
    const formArray = this.getFormControl(question.id) as FormArray;
    if (!formArray || !question.options) return [];
    
    // Create a sorted array based on the current ranking values
    const rankings = formArray.value as number[];
    const optionsWithRanking = question.options.map((option, index) => ({
      ...option,
      ranking: rankings[index]
    }));
    
    // Sort by ranking
    return optionsWithRanking.sort((a, b) => a.ranking - b.ranking);
  }

  onRankingDrop(event: CdkDragDrop<any[]>, questionId: string) {
    const formArray = this.getFormControl(questionId) as FormArray;
    if (!formArray) return;
    
    const rankings = [...formArray.value];
    moveItemInArray(rankings, event.previousIndex, event.currentIndex);
    
    // Update the form array with new rankings
    rankings.forEach((_, index) => {
      formArray.at(index).setValue(index + 1);
    });
  }
}
