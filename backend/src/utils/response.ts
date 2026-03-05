import { HttpResponseInit } from '@azure/functions'

export function jsonResponse(data: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    },
    body: JSON.stringify(data),
  }
}

export function errorResponse(message: string, status = 500): HttpResponseInit {
  return jsonResponse({ error: message, success: false }, status)
}

export function successResponse<T>(data: T, status = 200): HttpResponseInit {
  return jsonResponse({ data, success: true }, status)
}

export function validateId(id: string): boolean {
  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

export function sanitizeInput(input: string, maxLength = 1000): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Basic XSS prevention
}
