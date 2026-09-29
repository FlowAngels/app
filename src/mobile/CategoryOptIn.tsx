import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { broadcast, computeCategoryIntersection, setPlayerCategories } from '../lib/orchestrator'
import { parseStringArray } from '../lib/gameState'

const CATEGORIES = [
  {
    id: 'headline_hijack',
    name: 'Headline Hijack',
    description: 'Complete a suspiciously plausible headline in your own voice.'
  }
]

interface CategoryOptInProps {
  playerId: string
  roomId: string
  onComplete?: () => void
}

export default function CategoryOptIn({ playerId, roomId, onComplete }: CategoryOptInProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['headline_hijack'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categoriesLocked, setCategoriesLocked] = useState<number>(0)

  const loadExistingSelections = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('selected_categories')
        .eq('id', playerId)
        .single()

      if (error) {
        console.error('Error loading category selections:', error)
        return
      }

      const existing = parseStringArray(data?.selected_categories).filter(
        (category) => category === 'headline_hijack',
      )
      if (existing.length > 0) setSelectedCategories(existing)
    } catch (error) {
      console.error('Error loading category selections:', error)
    }
  }, [playerId])

  const loadCategoryIntersection = useCallback(async () => {
    try {
      const intersection = await computeCategoryIntersection(roomId)
      setCategoriesLocked(intersection.length)
    } catch (error) {
      console.error('Error loading category intersection:', error)
    }
  }, [roomId])

  // Load existing selections and intersection on mount
  useEffect(() => {
    loadExistingSelections()
    loadCategoryIntersection()
  }, [playerId, loadExistingSelections, loadCategoryIntersection])

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId)
      } else {
        return [...prev, categoryId]
      }
    })
  }

  const saveSelections = async () => {
    if (selectedCategories.length === 0) {
      alert('Please select at least one category to continue')
      return
    }

    setIsSubmitting(true)
    
    try {
      await setPlayerCategories(playerId, selectedCategories)

      // Also broadcast a categories:update so hosts update even if PG changes aren't enabled
      try {
        await broadcast(roomId, 'categories:update', { playerId, selectedCategories })
      } catch (e) {
        console.warn('categories:update broadcast failed', e)
      }

      // Refresh intersection after saving
      await loadCategoryIntersection()

      onComplete?.()
    } catch (error) {
      console.error('Error saving category selections:', error)
      alert('Failed to save selections. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">
          Ready for Headline Hijack?
        </h1>
        <p className="text-gray-600 text-center mb-6 text-sm">
          This focused build starts with one mode: complete the headline so it is funny, but still sounds recognisably like you.
        </p>

        <div className="space-y-3">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => toggleCategory(category.id)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                selectedCategories.includes(category.id)
                  ? 'border-green-600 bg-green-100 shadow-lg ring-2 ring-green-200'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">
                    {category.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {category.description}
                  </p>
                </div>
                <div className={`w-8 h-8 rounded-full border-3 flex items-center justify-center transition-all ${
                  selectedCategories.includes(category.id)
                    ? 'border-green-600 bg-green-600 shadow-lg scale-110'
                    : 'border-gray-400 bg-white'
                }`}>
                  {selectedCategories.includes(category.id) && (
                    <svg className="w-5 h-5 text-white font-bold" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-center mb-4 space-y-2">
            <p className="text-xs text-gray-500">
              Mode selected: <span className="font-semibold">Headline Hijack</span>
            </p>
            <p className="text-xs text-blue-600">
              Players ready with this mode: <span className="font-bold">{categoriesLocked > 0 ? 'everyone' : 'waiting'}</span>
            </p>
            <p className="text-xs text-gray-400">
              More modes return only after this core loop earns them in playtesting.
            </p>
          </div>
          <button
            onClick={saveSelections}
            disabled={isSubmitting || selectedCategories.length === 0}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving...' : "I'm In"}
          </button>
        </div>
      </div>
    </div>
  )
}
