import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { 
  Survey, 
  SurveyQuestion, 
  QuestionType, 
  QuestionOption, 
  SurveyType, 
  SurveyStatus, 
  SurveyDisplayMode, 
  SurveyTriggerType,
  BranchingRule,
  BranchCondition,
  BranchAction,
  ConditionOperator,
  BranchActionType,
  VisibilityCondition,
  BranchTarget
} from '../../models/survey.model';
import { SurveyService } from '../../services/survey.service';
import { ToastService } from '../../services/toast.service';
import { EdcCompliantAuthService } from '../../services/edc-compliant-auth.service';

@Component({
  selector: 'app-survey-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './survey-editor.component.html',
  styleUrls: ['./survey-editor.component.scss']
})
export class SurveyEditorComponent implements OnInit {
  @Input() survey: Survey | null = null;
  @Output() save = new EventEmitter<Survey>();
  @Output() close = new EventEmitter<void>();
  
  surveyForm!: FormGroup;
  currentStep = 1;
  totalSteps = 4;
  isSaving = false;
  
  // Question type options
  questionTypes: { value: QuestionType; label: string; icon: string }[] = [
    { value: 'single-choice', label: 'Single Choice', icon: 'fas fa-dot-circle' },
    { value: 'multiple-choice', label: 'Multiple Choice', icon: 'fas fa-check-square' },
    { value: 'combobox', label: 'Combobox (Multi-select)', icon: 'fas fa-list-check' },
    { value: 'text', label: 'Short Text', icon: 'fas fa-font' },
    { value: 'textarea', label: 'Long Text', icon: 'fas fa-align-left' },
    { value: 'number', label: 'Number', icon: 'fas fa-hashtag' },
    { value: 'date', label: 'Date', icon: 'fas fa-calendar' },
    { value: 'rating', label: 'Rating', icon: 'fas fa-star' },
    { value: 'scale', label: 'Scale', icon: 'fas fa-sliders-h' },
    { value: 'nps', label: 'NPS', icon: 'fas fa-chart-line' }
  ];
  
  constructor(
    private fb: FormBuilder,
    private surveyService: SurveyService,
    private authService: EdcCompliantAuthService,
    private toastService: ToastService
  ) {}
  
  ngOnInit() {
    this.initializeForm();
    if (this.survey) {
      this.populateForm();
    }
  }
  
  initializeForm() {
    this.surveyForm = this.fb.group({
      // Basic Information
      title: ['', Validators.required],
      description: [''],
      type: ['feedback', Validators.required],
      status: ['draft'],
      
      // Questions
      questions: this.fb.array([]),
      
      // Settings
      isAnonymous: [false],
      requiresAuth: [true],
      allowMultipleResponses: [false],
      maxResponsesPerUser: [1],
      
      // Display
      displayMode: ['popup'],
      welcomeScreen: this.fb.group({
        enabled: [true],
        title: ['Welcome'],
        message: ['']
      }),
      thankYouScreen: this.fb.group({
        enabled: [true],
        title: ['Thank You!'],
        message: ['Thank you for your feedback.']
      }),
      
      // Triggers
      triggers: this.fb.array([]),
      
      // Scheduling
      scheduledStartDate: [null],
      scheduledEndDate: [null],
      
      // Targeting
      targetRoles: [[]],
      targetStudies: [[]],
      targetPatientStatus: [[]]
    });
  }
  
  populateForm() {
    if (!this.survey) return;
    
    // Basic info
    this.surveyForm.patchValue({
      title: this.survey.title,
      description: this.survey.description,
      type: this.survey.type,
      status: this.survey.status,
      
      // Settings
      isAnonymous: this.survey.isAnonymous,
      requiresAuth: this.survey.requiresAuth,
      allowMultipleResponses: this.survey.allowMultipleResponses,
      maxResponsesPerUser: this.survey.maxResponsesPerUser,
      
      // Display
      displayMode: this.survey.displayMode,
      welcomeScreen: this.survey.welcomeScreen,
      thankYouScreen: this.survey.thankYouScreen,
      
      // Scheduling
      scheduledStartDate: this.survey.scheduledStartDate,
      scheduledEndDate: this.survey.scheduledEndDate,
      
      // Targeting
      targetRoles: this.survey.targetRoles || [],
      targetStudies: this.survey.targetStudies || [],
      targetPatientStatus: this.survey.targetPatientStatus || []
    });
    
    // Questions
    this.survey.questions.forEach(question => {
      this.addQuestion(question);
    });
    
    // Triggers
    if (this.survey.triggers) {
      this.survey.triggers.forEach(trigger => {
        this.addTrigger(trigger);
      });
    }
  }
  
  // Step navigation
  nextStep() {
    // Validate current step before proceeding
    if (!this.validateCurrentStep()) {
      return;
    }
    
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }
  
  previousStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }
  
  goToStep(step: number) {
    // Don't allow skipping ahead without validation
    if (step > this.currentStep && !this.validateCurrentStep()) {
      return;
    }
    this.currentStep = step;
  }
  
  validateCurrentStep(): boolean {
    switch (this.currentStep) {
      case 1: // Basic Information
        const title = this.surveyForm.get('title');
        const type = this.surveyForm.get('type');
        
        if (!title?.value || title.value.trim() === '') {
          this.toastService.error('Please enter a survey title');
          title?.markAsTouched();
          return false;
        }
        
        if (!type?.value) {
          this.toastService.error('Please select a survey type');
          type?.markAsTouched();
          return false;
        }
        return true;
        
      case 2: // Questions
        if (this.questions.length === 0) {
          this.toastService.error('Please add at least one question');
          return false;
        }
        
        // Validate each question has required fields
        for (let i = 0; i < this.questions.length; i++) {
          const question = this.questions.at(i);
          const text = question.get('text');
          const type = question.get('type');
          const options = question.get('options')?.value || [];
          
          if (!text?.value || text.value.trim() === '') {
            this.toastService.error(`Question ${i + 1}: Please enter question text`);
            text?.markAsTouched();
            return false;
          }
          
          // Check if question type needs options and has at least 2
          if (this.needsOptions(type?.value) && options.length < 2) {
            this.toastService.error(`Question ${i + 1}: Please add at least 2 answer options`);
            return false;
          }
          
          // Check that all options have text
          for (let j = 0; j < options.length; j++) {
            if (!options[j].text || options[j].text.trim() === '') {
              this.toastService.error(`Question ${i + 1}, Option ${j + 1}: Please enter option text`);
              return false;
            }
          }
        }
        return true;
        
      case 3: // Settings
        // Settings are optional, so always valid
        return true;
        
      case 4: // Review
        // Final review, no additional validation needed
        return true;
        
      default:
        return true;
    }
  }
  
  // Questions management
  get questions(): FormArray {
    return this.surveyForm.get('questions') as FormArray;
  }
  
  createQuestionForm(question?: SurveyQuestion): FormGroup {
    const questionType = question?.type || 'single-choice';
    let defaultOptions = question?.options || [];
    
    // Auto-populate options for new questions based on type
    if (!question) {
      switch (questionType) {
        case 'single-choice':
          // Default to Yes/No options for single-choice
          defaultOptions = [
            { id: 'yes', value: 'yes', text: 'Yes', order: 0 },
            { id: 'no', value: 'no', text: 'No', order: 1 }
          ];
          break;
        case 'multiple-choice':
          // Add some default options for multiple-choice
          defaultOptions = [
            { id: 'option1', value: 'option1', text: 'Option 1', order: 0 },
            { id: 'option2', value: 'option2', text: 'Option 2', order: 1 },
            { id: 'option3', value: 'option3', text: 'Option 3', order: 2 }
          ];
          break;
        case 'combobox':
          // Add default options for combobox (multi-select)
          defaultOptions = [
            { id: 'option1', value: 'option1', text: 'Option 1', order: 0 },
            { id: 'option2', value: 'option2', text: 'Option 2', order: 1 },
            { id: 'option3', value: 'option3', text: 'Option 3', order: 2 },
            { id: 'option4', value: 'option4', text: 'Option 4', order: 3 }
          ];
          break;
        case 'matrix':
          // Matrix questions need row and column options
          defaultOptions = [
            { id: 'row1', value: 'row1', text: 'Row 1', order: 0 },
            { id: 'row2', value: 'row2', text: 'Row 2', order: 1 },
            { id: 'col1', value: 'col1', text: 'Column 1', order: 2 },
            { id: 'col2', value: 'col2', text: 'Column 2', order: 3 }
          ];
          break;
        case 'ranking':
          // Ranking questions need items to rank
          defaultOptions = [
            { id: 'item1', value: 'item1', text: 'Item 1', order: 0 },
            { id: 'item2', value: 'item2', text: 'Item 2', order: 1 },
            { id: 'item3', value: 'item3', text: 'Item 3', order: 2 }
          ];
          break;
      }
    }
    
    // Default settings based on question type
    let defaultSettings = question?.settings || {};
    if (!question) {
      switch (questionType) {
        case 'scale':
          defaultSettings = {
            scaleMin: 1,
            scaleMax: 10,
            scaleMinLabel: 'Strongly Disagree',
            scaleMaxLabel: 'Strongly Agree'
          };
          break;
        case 'rating':
          defaultSettings = {
            ratingMax: 5
          };
          break;
        case 'nps':
          defaultSettings = {
            scaleMin: 0,
            scaleMax: 10,
            scaleMinLabel: 'Not likely',
            scaleMaxLabel: 'Extremely likely'
          };
          break;
      }
    }
    
    return this.fb.group({
      id: [question?.id || this.generateId()],
      type: [questionType, Validators.required],
      text: [question?.text || '', Validators.required],
      description: [question?.description || ''],
      required: [question?.required ?? true],
      order: [question?.order ?? this.questions.length],
      options: [defaultOptions],
      settings: this.fb.group(defaultSettings),
      validation: this.fb.group({
        minLength: [question?.validation?.minLength || null],
        maxLength: [question?.validation?.maxLength || null],
        minValue: [question?.validation?.minValue || null],
        maxValue: [question?.validation?.maxValue || null],
        pattern: [question?.validation?.pattern || '']
      }),
      branchingLogic: this.fb.array(
        question?.branchingLogic?.map(rule => this.createBranchingRuleForm(rule)) || []
      ),
      visibilityConditions: this.fb.array(
        question?.visibilityConditions?.map(condition => this.createVisibilityConditionForm(condition)) || []
      )
    });
  }
  
  addQuestion(question?: SurveyQuestion) {
    const questionForm = this.createQuestionForm(question);
    const questionIndex = this.questions.length;
    
    // Subscribe to type changes to update options
    questionForm.get('type')?.valueChanges.subscribe(newType => {
      this.onQuestionTypeChange(questionIndex, newType);
    });
    
    this.questions.push(questionForm);
  }
  
  onQuestionTypeChange(questionIndex: number, newType: QuestionType) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    // Get current options
    const currentOptions = question.get('options')?.value || [];
    
    // Only update options if switching to a type that needs them and current options are empty or default
    if (this.needsOptions(newType)) {
      let newOptions: QuestionOption[] = [];
      
      switch (newType) {
        case 'single-choice':
          // If switching from another choice type, keep existing options
          if (currentOptions.length > 0 && this.needsOptions(question.get('type')?.value)) {
            newOptions = currentOptions;
          } else {
            // Otherwise use Yes/No defaults
            newOptions = [
              { id: 'yes', value: 'yes', text: 'Yes', order: 0 },
              { id: 'no', value: 'no', text: 'No', order: 1 }
            ];
          }
          break;
        case 'multiple-choice':
          // If switching from another choice type, keep existing options
          if (currentOptions.length > 0 && this.needsOptions(question.get('type')?.value)) {
            newOptions = currentOptions;
          } else {
            // Otherwise use default options
            newOptions = [
              { id: 'option1', value: 'option1', text: 'Option 1', order: 0 },
              { id: 'option2', value: 'option2', text: 'Option 2', order: 1 },
              { id: 'option3', value: 'option3', text: 'Option 3', order: 2 }
            ];
          }
          break;
        case 'combobox':
          // If switching from another choice type, keep existing options
          if (currentOptions.length > 0 && this.needsOptions(question.get('type')?.value)) {
            newOptions = currentOptions;
          } else {
            // Otherwise use default options for combobox
            newOptions = [
              { id: 'option1', value: 'option1', text: 'Option 1', order: 0 },
              { id: 'option2', value: 'option2', text: 'Option 2', order: 1 },
              { id: 'option3', value: 'option3', text: 'Option 3', order: 2 },
              { id: 'option4', value: 'option4', text: 'Option 4', order: 3 }
            ];
          }
          break;
        case 'matrix':
          newOptions = [
            { id: 'row1', value: 'row1', text: 'Row 1', order: 0 },
            { id: 'row2', value: 'row2', text: 'Row 2', order: 1 },
            { id: 'col1', value: 'col1', text: 'Column 1', order: 2 },
            { id: 'col2', value: 'col2', text: 'Column 2', order: 3 }
          ];
          break;
        case 'ranking':
          newOptions = [
            { id: 'item1', value: 'item1', text: 'Item 1', order: 0 },
            { id: 'item2', value: 'item2', text: 'Item 2', order: 1 },
            { id: 'item3', value: 'item3', text: 'Item 3', order: 2 }
          ];
          break;
      }
      
      question.patchValue({ options: newOptions });
    } else {
      // Clear options for types that don't need them
      question.patchValue({ options: [] });
    }
    
    // Update settings based on type
    let newSettings: any = {};
    switch (newType) {
      case 'scale':
        newSettings = {
          scaleMin: 1,
          scaleMax: 10,
          scaleMinLabel: 'Strongly Disagree',
          scaleMaxLabel: 'Strongly Agree'
        };
        break;
      case 'rating':
        newSettings = {
          ratingMax: 5
        };
        break;
      case 'nps':
        newSettings = {
          scaleMin: 0,
          scaleMax: 10,
          scaleMinLabel: 'Not likely',
          scaleMaxLabel: 'Extremely likely'
        };
        break;
    }
    
    question.get('settings')?.patchValue(newSettings);
  }
  
  removeQuestion(index: number) {
    this.questions.removeAt(index);
    this.updateQuestionOrder();
  }
  
  moveQuestion(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.questions.length) return;
    
    const questions = this.questions.controls;
    [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];
    this.updateQuestionOrder();
  }
  
  updateQuestionOrder() {
    this.questions.controls.forEach((control, index) => {
      control.patchValue({ order: index });
    });
  }
  
  // Question options management
  addOption(questionIndex: number) {
    const question = this.questions.at(questionIndex);
    const options = question.get('options')!.value || [];
    const newOption: QuestionOption = {
      id: `option_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      value: `option_${options.length + 1}`,
      text: `Option ${options.length + 1}`,
      order: options.length
    };
    question.patchValue({ options: [...options, newOption] });
  }
  
  removeOption(questionIndex: number, optionIndex: number) {
    const question = this.questions.at(questionIndex);
    const options = question.get('options')!.value || [];
    const updatedOptions = options.filter((_: any, index: number) => index !== optionIndex);
    // Update order for remaining options
    updatedOptions.forEach((opt: QuestionOption, index: number) => {
      opt.order = index;
    });
    question.patchValue({ options: updatedOptions });
  }
  
  updateOption(questionIndex: number, optionIndex: number, field: 'value' | 'text', value: string) {
    const question = this.questions.at(questionIndex);
    const options = question.get('options')!.value || [];
    if (options[optionIndex]) {
      // Create a new array with updated option to maintain immutability
      const updatedOptions = options.map((opt: QuestionOption, idx: number) => {
        if (idx === optionIndex) {
          return { ...opt, [field]: value };
        }
        return opt;
      });
      question.get('options')!.setValue(updatedOptions);
    }
  }

  // Per-option branching (Microsoft Forms style)
  updateOptionBranching(questionIndex: number, optionIndex: number, raw: string) {
    const question = this.questions.at(questionIndex);
    if (!question) return;

    const options: QuestionOption[] = question.get('options')!.value || [];
    if (!options[optionIndex]) return;

    let branchTo: BranchTarget | undefined;
    if (!raw || raw === 'next') {
      branchTo = undefined; // default behavior: go to next visible question
    } else if (raw === 'end') {
      branchTo = { type: 'end' };
    } else if (raw.startsWith('question:')) {
      const targetId = raw.split(':')[1];
      branchTo = { type: 'question', questionId: targetId };
    } else if (raw.startsWith('section:')) {
      const sectionId = raw.split(':')[1];
      branchTo = { type: 'section', sectionId };
    }

    // Create a new array with updated option to maintain immutability
    const updatedOptions = options.map((opt: QuestionOption, idx: number) => {
      if (idx === optionIndex) {
        const updated = { ...opt } as any;
        if (branchTo) {
          updated.branchTo = branchTo;
        } else {
          delete updated.branchTo;
        }
        return updated;
      }
      return opt;
    });
    
    question.get('options')!.setValue(updatedOptions);
  }

  // Only allow branching to questions after the current one to reduce cycles
  getAvailableQuestionsForBranching(currentQuestionIndex: number): { id: string; text: string }[] {
    return this.questions.controls
      .map((q, index) => ({ id: q.get('id')?.value as string, text: (q.get('text')?.value || `Question ${index + 1}`) as string, index }))
      .filter(q => q.index > currentQuestionIndex)
      .map(q => ({ id: q.id, text: q.text }));
  }
  
  // Triggers management
  get triggers(): FormArray {
    return this.surveyForm.get('triggers') as FormArray;
  }
  
  createTriggerForm(trigger?: any): FormGroup {
    return this.fb.group({
      type: [trigger?.type || 'page_view'],
      value: [trigger?.value || ''],
      delay: [trigger?.delay || 0]
    });
  }
  
  addTrigger(trigger?: any) {
    this.triggers.push(this.createTriggerForm(trigger));
  }
  
  removeTrigger(index: number) {
    this.triggers.removeAt(index);
  }
  
  // Save survey
  async saveSurvey() {
    if (!this.surveyForm.valid) {
      this.toastService.error('Please fill in all required fields');
      return;
    }
    
    this.isSaving = true;
    
    try {
      const formValue = this.surveyForm.value;
      const currentUserProfile = await this.authService.getCurrentUserProfile();
      
      const surveyData: Partial<Survey> = {
        ...formValue,
        questions: formValue.questions.map((q: any, index: number) => ({
          ...q,
          order: index
        })),
        isActive: formValue.status === 'active',
        createdBy: this.survey?.createdBy || currentUserProfile?.uid,
        lastModifiedBy: currentUserProfile?.uid
      };
      
      let savedSurvey: Survey;
      if (this.survey?.id) {
        await this.surveyService.updateSurvey(this.survey.id, surveyData);
        savedSurvey = { ...this.survey, ...surveyData } as Survey;
      } else {
        savedSurvey = await this.surveyService.createSurvey(surveyData as Omit<Survey, 'id' | 'createdAt' | 'lastModifiedAt'>);
      }
      
      this.save.emit(savedSurvey);
    } catch (error) {
      console.error('Error saving survey:', error);
      this.toastService.error('Failed to save survey');
    } finally {
      this.isSaving = false;
    }
  }
  
  // Helpers
  generateId(): string {
    return 'q_' + Math.random().toString(36).substr(2, 9);
  }
  
  // Branching Logic Methods
  createBranchingRuleForm(rule?: BranchingRule): FormGroup {
    return this.fb.group({
      id: [rule?.id || this.generateId()],
      name: [rule?.name || ''],
      enabled: [rule?.enabled ?? true],
      conditionLogic: [rule?.conditionLogic || 'all'],
      conditions: this.fb.array(
        rule?.conditions?.map(c => this.createBranchConditionForm(c)) || [this.createBranchConditionForm()]
      ),
      action: this.fb.group({
        type: [rule?.action?.type || 'skip-to-question'],
        target: this.fb.group({
          type: [rule?.action?.target?.type || 'question'],
          questionId: [rule?.action?.target?.questionId || ''],
          sectionId: [rule?.action?.target?.sectionId || '']
        }),
        message: [rule?.action?.message || '']
      })
    });
  }
  
  createBranchConditionForm(condition?: BranchCondition): FormGroup {
    return this.fb.group({
      questionId: [condition?.questionId || ''],
      operator: [condition?.operator || 'equals'],
      value: [condition?.value || ''],
      optionId: [condition?.optionId || '']
    });
  }
  
  createVisibilityConditionForm(condition?: VisibilityCondition): FormGroup {
    return this.fb.group({
      questionId: [condition?.questionId || ''],
      operator: [condition?.operator || 'equals'],
      value: [condition?.value || ''],
      optionId: [condition?.optionId || '']
    });
  }
  
  addBranchingRule(questionIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const branchingLogic = question.get('branchingLogic') as FormArray;
    branchingLogic.push(this.createBranchingRuleForm());
  }
  
  removeBranchingRule(questionIndex: number, ruleIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const branchingLogic = question.get('branchingLogic') as FormArray;
    branchingLogic.removeAt(ruleIndex);
  }
  
  addBranchCondition(questionIndex: number, ruleIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const branchingLogic = question.get('branchingLogic') as FormArray;
    const rule = branchingLogic.at(ruleIndex);
    if (!rule) return;
    
    const conditions = rule.get('conditions') as FormArray;
    conditions.push(this.createBranchConditionForm());
  }
  
  removeBranchCondition(questionIndex: number, ruleIndex: number, conditionIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const branchingLogic = question.get('branchingLogic') as FormArray;
    const rule = branchingLogic.at(ruleIndex);
    if (!rule) return;
    
    const conditions = rule.get('conditions') as FormArray;
    conditions.removeAt(conditionIndex);
  }
  
  addVisibilityCondition(questionIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const visibilityConditions = question.get('visibilityConditions') as FormArray;
    visibilityConditions.push(this.createVisibilityConditionForm());
  }
  
  removeVisibilityCondition(questionIndex: number, conditionIndex: number) {
    const question = this.questions.at(questionIndex);
    if (!question) return;
    
    const visibilityConditions = question.get('visibilityConditions') as FormArray;
    visibilityConditions.removeAt(conditionIndex);
  }
  
  getAvailableQuestions(currentQuestionIndex: number): any[] {
    return this.questions.controls
      .map((q, index) => ({ 
        id: q.get('id')?.value, 
        text: q.get('text')?.value || `Question ${index + 1}`,
        index: index
      }))
      .filter((q, index) => index !== currentQuestionIndex);
  }
  
  getQuestionOptions(questionId: string): QuestionOption[] {
    const question = this.questions.controls.find(q => q.get('id')?.value === questionId);
    return question?.get('options')?.value || [];
  }
  
  getOperators(): { value: ConditionOperator; label: string }[] {
    return [
      { value: 'equals', label: 'Equals' },
      { value: 'not-equals', label: 'Not Equals' },
      { value: 'contains', label: 'Contains' },
      { value: 'not-contains', label: 'Does Not Contain' },
      { value: 'greater-than', label: 'Greater Than' },
      { value: 'less-than', label: 'Less Than' },
      { value: 'greater-than-or-equal', label: 'Greater Than or Equal' },
      { value: 'less-than-or-equal', label: 'Less Than or Equal' },
      { value: 'is-answered', label: 'Is Answered' },
      { value: 'is-not-answered', label: 'Is Not Answered' },
      { value: 'selected', label: 'Option Selected' },
      { value: 'not-selected', label: 'Option Not Selected' }
    ];
  }
  
  getActionTypes(): { value: BranchActionType; label: string }[] {
    return [
      { value: 'skip-to-question', label: 'Skip to Question' },
      { value: 'skip-to-end', label: 'Skip to End' },
      { value: 'end-survey', label: 'End Survey' },
      { value: 'show-message', label: 'Show Message' }
    ];
  }
  
  getSurveyTypeLabel(type: SurveyType): string {
    // Return the translation key for the survey type
    // The template will handle the actual translation
    return `survey.${type}`;
  }
  
  getTriggerTypeLabel(type: SurveyTriggerType): string {
    const labels: Record<SurveyTriggerType, string> = {
      immediate: 'Immediate',
      delay: 'Delay',
      'exit-intent': 'Exit Intent',
      scroll: 'Scroll',
      manual: 'Manual',
      'page-visit': 'Page Visit'
    };
    return labels[type] || type;
  }
  
  getDisplayModeLabel(mode: SurveyDisplayMode): string {
    // Return the translation key for the display mode
    // The template will handle the actual translation
    return `survey.${mode}_display`;
  }
  
  // Question type helpers
  needsOptions(type: QuestionType): boolean {
    return ['single-choice', 'multiple-choice', 'combobox', 'matrix', 'ranking'].includes(type);
  }
  
  needsRatingSettings(type: QuestionType): boolean {
    return type === 'rating';
  }
  
  needsScaleSettings(type: QuestionType): boolean {
    return ['scale', 'nps'].includes(type);
  }
  
  onCancel() {
    if (this.surveyForm.dirty) {
      if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        this.close.emit();
      }
    } else {
      this.close.emit();
    }
  }
  
  // TrackBy functions to prevent input unfocusing
  trackByQuestionIndex(index: number): number {
    return index;
  }
  
  trackByOptionIndex(index: number): number {
    return index;
  }
  
  trackByTriggerIndex(index: number): number {
    return index;
  }
}
