import { Firestore, collection, getDocs, doc, updateDoc, deleteField } from '@angular/fire/firestore';

/**
 * Utility function to fix template IDs in Firestore
 * This removes the internal 'id' field from templates to avoid conflicts with document IDs
 */
export async function fixTemplateIds(firestore: Firestore): Promise<void> {
  try {
    console.log('Starting template ID fix...');
    
    const templatesRef = collection(firestore, 'formTemplates');
    const snapshot = await getDocs(templatesRef);
    
    let fixedCount = 0;
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      
      // Check if the document has an internal 'id' field
      if (data['id']) {
        console.log(`Fixing template ${docSnap.id}: removing internal id field "${data['id']}"`);
        
        // Remove the id field from the document
        const docRef = doc(firestore, 'formTemplates', docSnap.id);
        await updateDoc(docRef, {
          id: deleteField()
        });
        
        fixedCount++;
      }
    }
    
    console.log(`Template ID fix complete. Fixed ${fixedCount} templates.`);
  } catch (error) {
    console.error('Error fixing template IDs:', error);
    throw error;
  }
}
