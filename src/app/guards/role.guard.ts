import { Injectable, inject } from '@angular/core';
import { 
  CanActivate, 
  ActivatedRouteSnapshot, 
  RouterStateSnapshot, 
  Router,
  UrlTree 
} from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { EdcCompliantAuthService } from '../services/edc-compliant-auth.service';
import { AccessLevel } from '../enums/access-levels.enum';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  private authService = inject(EdcCompliantAuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    const requiredRoles = route.data['roles'] as AccessLevel[];
    
    return this.authService.currentUserProfile$.pipe(
      take(1),
      map(userProfile => {
        if (!userProfile) {
          return this.router.createUrlTree(['/login']);
        }

        if (requiredRoles && requiredRoles.includes(userProfile.accessLevel)) {
          return true;
        }

        // User doesn't have required role
        return this.router.createUrlTree(['/unauthorized']);
      })
    );
  }
}
