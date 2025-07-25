import { Injectable, inject } from '@angular/core';
import { 
  CanActivate, 
  ActivatedRouteSnapshot, 
  RouterStateSnapshot, 
  Router,
  UrlTree 
} from '@angular/router';
import { Observable, of, catchError } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { EdcCompliantAuthService } from '../services/edc-compliant-auth.service';
import { UserStatus } from '../enums/access-levels.enum';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private authService = inject(EdcCompliantAuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    return this.authService.currentUserProfile$.pipe(
      take(1),
      map(userProfile => {
        if (!userProfile) {
          // Not logged in, redirect to auth page (home)
          return this.router.createUrlTree(['/auth'], {
            queryParams: { returnUrl: state.url }
          });
        }

        // Check if user account is active
        if (userProfile.status !== UserStatus.ACTIVE) {
          console.log('User account not active, redirecting to auth');
          this.authService.signOut('forced');
          return this.router.createUrlTree(['/auth'], {
            queryParams: { reason: 'account-not-active' }
          });
        }

        // Check if user has completed compliance setup
        const isCompliant = userProfile.agreedToTerms && userProfile.trainingCompleted;
        if (!isCompliant && state.url !== '/compliance-setup') {
          // Redirect to compliance setup page if not already there
          return this.router.createUrlTree(['/compliance-setup']);
        }

        // If user is compliant but trying to access compliance page, redirect to dashboard
        if (isCompliant && state.url === '/compliance-setup') {
            return this.router.createUrlTree(['/dashboard']);
        }

        return true;
      }),
      catchError(error => {
        console.error('Auth guard error, redirecting to auth:', error);
        // On any error, redirect to auth page instead of showing grey screen
        return of(this.router.createUrlTree(['/auth'], {
          queryParams: { error: 'auth-error' }
        }));
      })
    );
  }
}
