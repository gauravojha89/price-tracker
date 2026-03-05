import { useState, useCallback } from 'react'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(
    async (apiCall: () => Promise<{ success: boolean; data?: T; error?: string }>) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      const result = await apiCall()

      if (result.success && result.data !== undefined) {
        setState({ data: result.data, loading: false, error: null })
        return result.data
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error || 'An error occurred',
        }))
        return null
      }
    },
    []
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, execute, reset }
}

export default useApi
