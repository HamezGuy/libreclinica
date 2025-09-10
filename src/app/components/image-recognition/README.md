# Angular Image Recognition Module

## 🚀 Quick Integration

This is a drag-and-drop Angular module for AI image recognition using YOLO11.

## 📦 Installation

1. **Copy the entire `angular-image-recognition` folder** into your Angular project's `src/app/` directory

2. **Import the module** in your `app.module.ts`:
```typescript
import { ImageRecognitionModule } from './angular-image-recognition/image-recognition.module';

@NgModule({
  imports: [
    // ... other imports
    ImageRecognitionModule
  ]
})
export class AppModule { }
```

3. **Use the component** anywhere in your templates:
```html
<app-image-recognition></app-image-recognition>
```

## 📋 Requirements

Your Angular project needs:
- Angular 12+ (tested with Angular 14-17)
- HttpClientModule (already included in the module)

## 🎨 Customization

### Change API Endpoint
Edit `image-recognition.service.ts`:
```typescript
private apiUrl = 'YOUR_API_URL_HERE';
```

### Styling
The component uses its own CSS. To override styles, use:
```css
::ng-deep .image-recognition-container {
  /* Your custom styles */
}
```

### Full Page Integration
To use as a full page component:
```typescript
// In your routing module
{
  path: 'image-recognition',
  component: ImageRecognitionComponent
}
```

## 🔧 Features

- ✅ Drag & drop image upload
- ✅ Real-time API status check
- ✅ Object detection with YOLO11
- ✅ Wound measurement capabilities
- ✅ Processing time display
- ✅ Confidence scores
- ✅ Annotated image display
- ✅ Raw JSON viewer
- ✅ Responsive design
- ✅ Error handling

## 📱 Responsive Design

The component is fully responsive and works on:
- Desktop (900px max width)
- Tablet (auto-adjusts)
- Mobile (stacks vertically)

## 🎯 API Configuration

The module connects to:
```
https://ai-image-recognition-api-415455874994.us-central1.run.app
```

API Features:
- Max file size: 10MB
- Supported formats: JPG, PNG, BMP, TIFF
- Auto-scaling: 0-10 instances
- Response time: ~200-500ms

## 💡 Usage Examples

### Basic Implementation
```html
<!-- In your component template -->
<div class="my-page">
  <h1>My Application</h1>
  <app-image-recognition></app-image-recognition>
</div>
```

### With Custom Container
```html
<div class="custom-container">
  <app-image-recognition></app-image-recognition>
</div>
```

### Listen to Events (Advanced)
You can extend the component to emit events:
```typescript
// In image-recognition.component.ts
@Output() imageProcessed = new EventEmitter<any>();

// After processing
this.imageProcessed.emit(this.results);
```

## 🐛 Troubleshooting

### CORS Issues
The API accepts all origins (`*`). If you still face issues:
1. Check browser console for errors
2. Ensure HTTPS is used in production

### Module Not Found
Make sure you:
1. Copied all 5 files
2. Updated the import path correctly
3. Added to your module's imports array

### Styling Conflicts
The component uses scoped styles. If conflicts occur:
1. Use `ViewEncapsulation.None` in your component
2. Or use `::ng-deep` for style overrides

## 📁 Files Included

- `image-recognition.module.ts` - Angular module definition
- `image-recognition.component.ts` - Component logic
- `image-recognition.component.html` - Template
- `image-recognition.component.css` - Styles
- `image-recognition.service.ts` - API service
- `README.md` - This file

## 🎉 Ready to Use!

Just drag the folder into your Angular project and import the module. The component will handle everything else!

## 📞 Support

For API issues, check:
- API Health: https://ai-image-recognition-api-415455874994.us-central1.run.app/api/health
- API Info: https://ai-image-recognition-api-415455874994.us-central1.run.app/api/info
