import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  limit,
  Timestamp,
  addDoc
} from '@angular/fire/firestore';
import { Observable, from, map, of, BehaviorSubject } from 'rxjs';
import { Survey, SurveyResponse, SurveyStatus, SurveyAnalytics } from '../models/survey.model';
import { EdcCompliantAuthService } from './edc-compliant-auth.service';

@Injectable({
  providedIn: 'root'
})
export class SurveyService {
  private readonly COLLECTION_NAME = 'surveys';
  private readonly RESPONSES_COLLECTION = 'survey_responses';
  
  // Track active surveys for popup display
  private activeSurveysSubject = new BehaviorSubject<Survey[]>([]);
  public activeSurveys$ = this.activeSurveysSubject.asObservable();
  private injector: Injector = inject(Injector);
  
  constructor(
    private firestore: Firestore,
    private authService: EdcCompliantAuthService
  ) {
    this.loadActiveSurveys();
  }
  
  // Survey CRUD operations
  async createSurvey(survey: Omit<Survey, 'id' | 'createdAt' | 'lastModifiedAt' | 'createdBy' | 'lastModifiedBy'>): Promise<Survey> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUserProfile = await this.authService.getCurrentUserProfile();
      if (!currentUserProfile) throw new Error('User not authenticated');
      
      const newSurvey: Survey = {
        ...survey,
        createdBy: currentUserProfile.uid,
        createdAt: new Date(),
        lastModifiedBy: currentUserProfile.uid,
        lastModifiedAt: new Date(),
        responseCount: 0,
        completionRate: 0,
        averageCompletionTime: 0
      };
      
      const docRef = await addDoc(collection(this.firestore, this.COLLECTION_NAME), newSurvey);
      const createdSurvey = { ...newSurvey, id: docRef.id };
      
      // Reload active surveys if this is active
      if (createdSurvey.status === 'active' && createdSurvey.isActive) {
        await this.loadActiveSurveys();
      }
      
      return createdSurvey;
    });
  }
  
  async updateSurvey(id: string, updates: Partial<Survey>): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const currentUserProfile = await this.authService.getCurrentUserProfile();
      if (!currentUserProfile) throw new Error('User not authenticated');
      
      const updateData = {
        ...updates,
        lastModifiedBy: currentUserProfile.uid,
        lastModifiedAt: Timestamp.now()
      };
      
      await updateDoc(doc(this.firestore, this.COLLECTION_NAME, id), updateData);
      
      // Reload active surveys
      await this.loadActiveSurveys();
    });
  }
  
  async getSurvey(id: string): Promise<Survey | null> {
    return await runInInjectionContext(this.injector, async () => {
      const docSnap = await getDoc(doc(this.firestore, this.COLLECTION_NAME, id));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Survey;
      }
      return null;
    });
  }
  
  async getSurveys(filters?: {
    status?: SurveyStatus;
    type?: string;
    studyId?: string;
    isActive?: boolean;
  }): Promise<Survey[]> {
    return await runInInjectionContext(this.injector, async () => {
      let q = query(collection(this.firestore, this.COLLECTION_NAME));
      
      if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters?.type) {
        q = query(q, where('type', '==', filters.type));
      }
      if (filters?.studyId) {
        q = query(q, where('targetAudience.studyIds', 'array-contains', filters.studyId));
      }
      if (filters?.isActive !== undefined) {
        q = query(q, where('isActive', '==', filters.isActive));
      }
      
      q = query(q, orderBy('createdAt', 'desc'));
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Survey));
    });
  }
  
  async deleteSurvey(id: string): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      await deleteDoc(doc(this.firestore, this.COLLECTION_NAME, id));
      await this.loadActiveSurveys();
    });
  }
  
  // Survey response operations
  async submitResponse(response: Omit<SurveyResponse, 'id' | 'startedAt'>): Promise<SurveyResponse> {
    return await runInInjectionContext(this.injector, async () => {
      const newResponse: SurveyResponse = {
        ...response,
        startedAt: new Date(),
        completedAt: response.isComplete ? new Date() : undefined,
        completionTimeSeconds: response.isComplete ? 
          Math.floor((new Date().getTime() - new Date().getTime()) / 1000) : undefined
      };
      
      const docRef = await addDoc(collection(this.firestore, this.RESPONSES_COLLECTION), newResponse);
      
      // Update survey response count
      const survey = await this.getSurvey(response.surveyId);
      if (survey) {
        await this.updateSurvey(response.surveyId, {
          responseCount: (survey.responseCount || 0) + 1
        });
      }
      
      return { ...newResponse, id: docRef.id };
    });
  }
  
  async getResponses(surveyId: string): Promise<SurveyResponse[]> {
    return await runInInjectionContext(this.injector, async () => {
      const q = query(
        collection(this.firestore, this.RESPONSES_COLLECTION),
        where('surveyId', '==', surveyId),
        orderBy('startedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SurveyResponse));
    });
  }
  
  async getUserResponses(userId: string, surveyId?: string): Promise<SurveyResponse[]> {
    return await runInInjectionContext(this.injector, async () => {
      let q = query(
        collection(this.firestore, this.RESPONSES_COLLECTION),
        where('respondentId', '==', userId)
      );
      
      if (surveyId) {
        q = query(q, where('surveyId', '==', surveyId));
      }
      
      q = query(q, orderBy('startedAt', 'desc'));
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SurveyResponse));
    });
  }
  
  // Analytics
  async getSurveyAnalytics(surveyId: string): Promise<SurveyAnalytics> {
    const responses = await this.getResponses(surveyId);
    const survey = await this.getSurvey(surveyId);
    
    if (!survey) throw new Error('Survey not found');
    
    const completedResponses = responses.filter(r => r.isComplete);
    const abandonedResponses = responses.filter(r => !r.isComplete);
    
    // Calculate average completion time
    const completionTimes = completedResponses
      .map(r => r.completionTimeSeconds)
      .filter(t => t !== undefined) as number[];
    const averageCompletionTime = completionTimes.length > 0 ?
      completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : 0;
    
    // Question-level analytics
    const questionAnalytics: SurveyAnalytics['questionAnalytics'] = {};
    
    survey.questions.forEach(question => {
      const questionResponses = completedResponses.filter(r => r.answers[question.id] !== undefined);
      const skippedCount = completedResponses.length - questionResponses.length;
      
      questionAnalytics[question.id] = {
        responseCount: questionResponses.length,
        skippedCount,
        averageTime: 0 // TODO: Implement time tracking per question
      };
      
      // For choice questions
      if (['single-choice', 'multiple-choice'].includes(question.type) && question.options) {
        const optionCounts: { [optionId: string]: number } = {};
        question.options.forEach(option => {
          optionCounts[option.id] = 0;
        });
        
        questionResponses.forEach(response => {
          const answer = response.answers[question.id];
          if (Array.isArray(answer)) {
            answer.forEach(optionId => {
              if (optionCounts[optionId] !== undefined) {
                optionCounts[optionId]++;
              }
            });
          } else if (optionCounts[answer] !== undefined) {
            optionCounts[answer]++;
          }
        });
        
        questionAnalytics[question.id].optionCounts = optionCounts;
      }
      
      // For numeric questions
      if (['number', 'rating', 'scale', 'nps'].includes(question.type)) {
        const numericValues = questionResponses
          .map(r => parseFloat(r.answers[question.id]))
          .filter(n => !isNaN(n));
        
        if (numericValues.length > 0) {
          questionAnalytics[question.id].average = 
            numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
          questionAnalytics[question.id].min = Math.min(...numericValues);
          questionAnalytics[question.id].max = Math.max(...numericValues);
        }
      }
    });
    
    // Time-based analytics
    const responsesByDay: { [date: string]: number } = {};
    const responsesByHour: number[] = new Array(24).fill(0);
    
    responses.forEach(response => {
      const date = response.startedAt.toISOString().split('T')[0];
      responsesByDay[date] = (responsesByDay[date] || 0) + 1;
      
      const hour = response.startedAt.getHours();
      responsesByHour[hour]++;
    });
    
    // Demographics
    const responsesByUserType: { [type: string]: number } = {};
    const responsesByDevice: { [device: string]: number } = {};
    
    responses.forEach(response => {
      responsesByUserType[response.respondentType] = 
        (responsesByUserType[response.respondentType] || 0) + 1;
      
      if (response.deviceType) {
        responsesByDevice[response.deviceType] = 
          (responsesByDevice[response.deviceType] || 0) + 1;
      }
    });
    
    return {
      surveyId,
      totalResponses: responses.length,
      completedResponses: completedResponses.length,
      abandonedResponses: abandonedResponses.length,
      averageCompletionTime,
      responseRate: survey.responseCount ? 
        (completedResponses.length / survey.responseCount) * 100 : 0,
      questionAnalytics,
      responsesByDay: Object.entries(responsesByDay).map(([date, count]) => ({
        date: new Date(date),
        count
      })),
      responsesByHour: responsesByHour.map((count, hour) => ({ hour, count })),
      responsesByUserType,
      responsesByDevice
    };
  }
  
  // Active survey management for popups
  private async loadActiveSurveys(): Promise<void> {
    return await runInInjectionContext(this.injector, async () => {
      const now = new Date();
      const q = query(
        collection(this.firestore, this.COLLECTION_NAME),
        where('status', '==', 'active'),
        where('isActive', '==', true)
      );
      
      const querySnapshot = await getDocs(q);
      const surveys = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Survey))
        .filter(survey => {
          // Check date range
          if (survey.startDate && new Date(survey.startDate) > now) return false;
          if (survey.endDate && new Date(survey.endDate) < now) return false;
          return true;
        });
      
      this.activeSurveysSubject.next(surveys);
    });
  }
  
  // Check if user should see a survey
  async shouldShowSurvey(survey: Survey, userId?: string, context?: any): Promise<boolean> {
    // Check if anonymous responses are allowed
    if (!survey.allowAnonymous && !userId) return false;
    
    // Check response limit
    if (survey.responseLimit) {
      const responses = await this.getResponses(survey.id!);
      if (responses.length >= survey.responseLimit) return false;
    }
    
    // Check if user has already responded
    if (userId && !survey.allowMultipleResponses) {
      const userResponses = await this.getUserResponses(userId, survey.id);
      if (userResponses.length > 0) return false;
    }
    
    // Check targeting criteria
    if (survey.targetAudience) {
      // TODO: Implement targeting logic based on user role, study, etc.
    }
    
    return true;
  }
  
  // Duplicate a survey
  async duplicateSurvey(surveyId: string): Promise<Survey> {
    const original = await this.getSurvey(surveyId);
    if (!original) throw new Error('Survey not found');
    
    const { id, createdAt, lastModifiedAt, createdBy, lastModifiedBy, ...duplicateData } = original;
    
    const duplicate = {
      ...duplicateData,
      title: `${original.title} (Copy)`,
      status: 'draft' as SurveyStatus,
      isActive: false,
      responseCount: 0,
      completionRate: 0,
      averageCompletionTime: 0
    };
    
    return this.createSurvey(duplicate);
  }
}
