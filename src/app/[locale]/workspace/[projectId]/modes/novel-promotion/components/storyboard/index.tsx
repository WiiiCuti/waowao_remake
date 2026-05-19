'use client'

import { useState } from 'react'
import { NovelPromotionStoryboard, NovelPromotionClip } from '@/types/project'
import { CharacterPickerModal, LocationPickerModal } from '../PanelEditForm'
import ImageEditModal from './ImageEditModal'
import AIDataModal from './AIDataModal'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import StoryboardStageShell from './StoryboardStageShell'
import StoryboardToolbar from './StoryboardToolbar'
import StoryboardCanvas from './StoryboardCanvas'
import PromptRefinerTab from './PromptRefinerTab'
import { useStoryboardStageController } from './hooks/useStoryboardStageController'
import { useStoryboardModalRuntime } from './hooks/useStoryboardModalRuntime'

interface StoryboardStageProps {
  projectId: string
  episodeId: string
  storyboards: NovelPromotionStoryboard[]
  clips: NovelPromotionClip[]
  videoRatio: string
  onBack: () => void
  onNext: () => void
  isTransitioning?: boolean
}

export default function StoryboardStage({
  projectId,
  episodeId,
  storyboards: initialStoryboards,
  clips,
  videoRatio,
  onBack,
  onNext,
  isTransitioning = false,
}: StoryboardStageProps) {
  const controller = useStoryboardStageController({
    projectId,
    episodeId,
    initialStoryboards,
    clips,
    isTransitioning,
  })

  const {
    localStoryboards,
    setLocalStoryboards,
    sortedStoryboards,
    expandedClips,
    toggleExpandedClip,
    getClipInfo,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    formatClipTitle,
    totalPanels,
    storyboardStartIndex,

    savingPanels,
    deletingPanelIds,
    saveStateByPanel,
    hasUnsavedByPanel,
    submittingStoryboardTextIds,
    addingStoryboardGroup,
    movingClipId,
    insertingAfterPanelId,
    savePanelWithData,
    addPanel,
    deletePanel,
    deleteStoryboard,
    regenerateStoryboardText,
    addStoryboardGroup,
    moveStoryboardGroup,
    insertPanel,

    submittingVariantPanelId,
    generatePanelVariant,

    submittingStoryboardIds,
    submittingPanelImageIds,
    selectingCandidateIds,

    editingPanel,
    setEditingPanel,
    modifyingPanels,
    isDownloadingImages,
    previewImage,
    setPreviewImage,
    regeneratePanelImage,
    regenerateAllPanelsIndividually,
    selectPanelCandidate,
    selectPanelCandidateIndex,
    cancelPanelCandidate,
    getPanelCandidates,
    downloadAllImages,
    clearStoryboardError,

    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    isEpisodeBatchSubmitting,

    getDefaultAssetsForClip,
    handleEditSubmit,
    handlePanelUpdate,
    handleAddCharacter,
    handleSetLocation,
    handleRemoveCharacter,
    handleRemoveLocation,
    retrySave,

    updatePhotographyPlanMutation,
    updatePanelActingNotesMutation,

    addingStoryboardGroupState,
    transitioningState,
    runningCount,
    pendingPanelCount,
    handleGenerateAllPanels,
  } = controller

  const [activeTab, setActiveTab] = useState<'canvas' | 'refine'>('canvas')

  const modalRuntime = useStoryboardModalRuntime({
    projectId,
    videoRatio,
    localStoryboards,
    editingPanel,
    setEditingPanel,
    assetPickerPanel,
    setAssetPickerPanel,
    aiDataPanel,
    setAIDataPanel,
    previewImage,
    setPreviewImage,
    getTextPanels,
    getPanelEditData,
    updatePanelEdit,
    savePanelWithData,
    getDefaultAssetsForClip,
    handleEditSubmit,
    handleAddCharacter,
    handleSetLocation,
    updatePhotographyPlanMutation,
    updatePanelActingNotesMutation,
  })

  return (
      <StoryboardStageShell
        isTransitioning={isTransitioning}
        isNextDisabled={isTransitioning || localStoryboards.length === 0}
        transitioningState={transitioningState}
        onNext={onNext}
      >
        <StoryboardToolbar
          totalSegments={sortedStoryboards.length}
          totalPanels={totalPanels}
          isDownloadingImages={isDownloadingImages}
          runningCount={runningCount}
          pendingPanelCount={pendingPanelCount}
          isBatchSubmitting={isEpisodeBatchSubmitting}
          addingStoryboardGroup={addingStoryboardGroup}
          addingStoryboardGroupState={addingStoryboardGroupState}
          onDownloadAllImages={downloadAllImages}
          onGenerateAllPanels={handleGenerateAllPanels}
          onAddStoryboardGroupAtStart={() => addStoryboardGroup(0)}
          onBack={onBack}
        />

        <div className="flex gap-1 rounded-xl bg-[var(--glass-bg-surface-strong)] p-1">
          <button
            onClick={() => setActiveTab('canvas')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'canvas'
                ? 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-primary)] shadow-sm'
                : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
            }`}
          >
            Canvas
          </button>
          <button
            onClick={() => setActiveTab('refine')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'refine'
                ? 'bg-[var(--glass-bg-surface)] text-[var(--glass-text-primary)] shadow-sm'
                : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
            }`}
          >
            Refine Prompt
          </button>
        </div>

        {activeTab === 'canvas' ? (
          <StoryboardCanvas
            sortedStoryboards={sortedStoryboards}
            videoRatio={videoRatio}
            expandedClips={expandedClips}
            submittingStoryboardIds={submittingStoryboardIds}
            selectingCandidateIds={selectingCandidateIds}
            submittingStoryboardTextIds={submittingStoryboardTextIds}
            savingPanels={savingPanels}
            deletingPanelIds={deletingPanelIds}
            saveStateByPanel={saveStateByPanel}
            hasUnsavedByPanel={hasUnsavedByPanel}
            modifyingPanels={modifyingPanels}
            submittingPanelImageIds={submittingPanelImageIds}

            movingClipId={movingClipId}
            insertingAfterPanelId={insertingAfterPanelId}
            submittingVariantPanelId={submittingVariantPanelId}
            projectId={projectId}
            episodeId={episodeId}
            storyboardStartIndex={storyboardStartIndex}
            getClipInfo={getClipInfo}
            getTextPanels={getTextPanels}
            getPanelEditData={getPanelEditData}
            formatClipTitle={formatClipTitle}
            onToggleExpandedClip={toggleExpandedClip}
            onMoveStoryboardGroup={moveStoryboardGroup}
            onRegenerateStoryboardText={regenerateStoryboardText}
            onAddPanel={addPanel}
            onDeleteStoryboard={deleteStoryboard}
            onGenerateAllIndividually={regenerateAllPanelsIndividually}
            onPreviewImage={setPreviewImage}
            onCloseStoryboardError={clearStoryboardError}
            onPanelUpdate={handlePanelUpdate}
            onPanelDelete={deletePanel}
            onOpenCharacterPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'character' })}
            onOpenLocationPicker={(panelId) => setAssetPickerPanel({ panelId, type: 'location' })}
            onRemoveCharacter={handleRemoveCharacter}
            onRemoveLocation={handleRemoveLocation}
            onRetryPanelSave={retrySave}
            onRegeneratePanelImage={regeneratePanelImage}
            onOpenEditModal={(storyboardId, panelIndex) => setEditingPanel({ storyboardId, panelIndex })}
            onOpenAIDataModal={(storyboardId, panelIndex) => setAIDataPanel({ storyboardId, panelIndex })}
            getPanelCandidates={getPanelCandidates}
            onSelectPanelCandidateIndex={selectPanelCandidateIndex}
            onConfirmPanelCandidate={selectPanelCandidate}
            onCancelPanelCandidate={cancelPanelCandidate}

            onInsertPanel={insertPanel}
            onPanelVariant={generatePanelVariant}
            addStoryboardGroup={addStoryboardGroup}
            addingStoryboardGroup={addingStoryboardGroup}
            setLocalStoryboards={setLocalStoryboards}
          />
        ) : (
          <PromptRefinerTab
            projectId={projectId}
            episodeId={episodeId}
            storyboards={sortedStoryboards}
            clips={clips}
            getClipInfo={getClipInfo}
            formatClipTitle={formatClipTitle}
          />
        )}

        {modalRuntime.editingPanel && (
          <ImageEditModal
            projectId={modalRuntime.projectId}
            defaultAssets={modalRuntime.imageEditDefaults}
            onSubmit={modalRuntime.handleEditSubmit}
            onClose={modalRuntime.closeImageEditModal}
          />
        )}

        {modalRuntime.aiDataPanel && modalRuntime.aiDataRuntime && (
          <AIDataModal
            isOpen={true}
            onClose={modalRuntime.closeAIDataModal}
            syncKey={modalRuntime.aiDataRuntime.panel.id}
            panelNumber={modalRuntime.aiDataRuntime.panelData.panelNumber || modalRuntime.aiDataPanel.panelIndex + 1}
            shotType={modalRuntime.aiDataRuntime.panelData.shotType}
            cameraMove={modalRuntime.aiDataRuntime.panelData.cameraMove}
            description={modalRuntime.aiDataRuntime.panelData.description}
            location={modalRuntime.aiDataRuntime.panelData.location}
            characters={modalRuntime.aiDataRuntime.characters}
            videoPrompt={modalRuntime.aiDataRuntime.panelData.videoPrompt}
            photographyRules={modalRuntime.aiDataRuntime.photographyRules}
            actingNotes={modalRuntime.aiDataRuntime.actingNotes}
            videoRatio={modalRuntime.videoRatio}
            onSave={modalRuntime.handleSaveAIData}
          />
        )}

        {modalRuntime.previewImage && (
          <ImagePreviewModal imageUrl={modalRuntime.previewImage} onClose={modalRuntime.closePreviewImage} />
        )}

        {modalRuntime.hasCharacterPicker && (
          <CharacterPickerModal
            projectId={projectId}
            currentCharacters={modalRuntime.pickerPanelRuntime ? getPanelEditData(modalRuntime.pickerPanelRuntime.panel).characters : []}
            onSelect={modalRuntime.handleAddCharacter}
            onClose={modalRuntime.closeAssetPicker}
          />
        )}

        {modalRuntime.hasLocationPicker && (
          <LocationPickerModal
            projectId={projectId}
            currentLocation={modalRuntime.pickerPanelRuntime ? getPanelEditData(modalRuntime.pickerPanelRuntime.panel).location || null : null}
            onSelect={modalRuntime.handleSetLocation}
            onClose={modalRuntime.closeAssetPicker}
          />
        )}
      </StoryboardStageShell>
  )
}
