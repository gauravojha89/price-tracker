import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthError } from '../services/auth.js'
import databaseService from '../services/database.js'
import { UpdateUserRequestSchema, User } from '../models/index.js'
import { successResponse, errorResponse } from '../utils/response.js'

// GET /api/user/profile - Get current user profile
async function getProfile(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    
    // Try to get existing user
    let user = await databaseService.getUserByEmail(auth.email!)
    
    // Create user if doesn't exist (first login)
    if (!user) {
      const now = new Date().toISOString()
      user = await databaseService.createUser({
        id: uuidv4(),
        email: auth.email!,
        name: auth.name,
        notificationPreference: 'email',
        createdAt: now,
        updatedAt: now,
      })
    }
    
    return successResponse(user)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to get profile', 500)
  }
}

// PUT /api/user/profile - Update user profile  
async function updateProfile(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = await requireAuth(request)
    
    const body = await request.json() as Record<string, unknown>
    
    // Validate request body
    const parseResult = UpdateUserRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse('Invalid request body: ' + parseResult.error.message, 400)
    }
    
    const updates = parseResult.data
    
    // Get existing user
    let user = await databaseService.getUserByEmail(auth.email!)
    
    if (!user) {
      // Create user if doesn't exist
      const now = new Date().toISOString()
      user = await databaseService.createUser({
        id: uuidv4(),
        email: auth.email!,
        name: updates.name,
        phoneNumber: updates.phoneNumber || undefined,
        notificationPreference: updates.notificationPreference || 'email',
        createdAt: now,
        updatedAt: now,
      })
    } else {
      // Update existing user
      user = await databaseService.updateUser(user.id, {
        name: updates.name ?? user.name,
        phoneNumber: updates.phoneNumber ?? user.phoneNumber,
        notificationPreference: updates.notificationPreference ?? user.notificationPreference,
      })
    }
    
    return successResponse(user)
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.statusCode)
    }
    return errorResponse('Failed to update profile', 500)
  }
}

app.http('getUserProfile', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'user/profile',
  handler: getProfile,
})

app.http('updateUserProfile', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'user/profile',
  handler: updateProfile,
})
