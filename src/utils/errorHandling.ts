import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  let errorMessage = '';
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'object' && error !== null) {
    try {
      errorMessage = JSON.stringify(error);
    } catch (e) {
      errorMessage = String(error);
    }
  } else {
    errorMessage = String(error);
  }

  const isPermissionDenied = errorMessage.toLowerCase().includes('permission') || 
                            errorMessage.toLowerCase().includes('insufficient');
  
  const isQuotaExceeded = errorMessage.toLowerCase().includes('quota') || 
                         errorMessage.toLowerCase().includes('resource-exhausted') ||
                         errorMessage.toLowerCase().includes('rate limit');

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid || 'unauthenticated',
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }

  // Log the error
  if (isPermissionDenied) {
    console.warn('Firestore Permission Denied: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  // Don't throw for permission denied or quota exceeded on GET/LIST operations
  // This prevents crashes during logout or initial data fetching
  if ((isPermissionDenied || isQuotaExceeded) && (operationType === OperationType.GET || operationType === OperationType.LIST)) {
    return;
  }

  throw new Error(JSON.stringify(errInfo));
}
