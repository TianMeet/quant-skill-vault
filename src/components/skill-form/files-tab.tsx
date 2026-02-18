'use client'

import { useMemo, useState } from 'react'
import { ArrowRightLeft, File as FileIcon, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export interface SkillFileItem {
  path: string
  mime: string
  isBinary: boolean
  size?: number
  contentText?: string
}

interface FilesTabProps {
  skillId?: number
  roundedClass: string
  roundedLgClass: string
  ALLOWED_DIRS: string[]
  files: SkillFileItem[]
  selectedFile: SkillFileItem | null
  fileContent: string
  newFileDir: string
  setNewFileDir: (value: string) => void
  newFileName: string
  setNewFileName: (value: string) => void
  fileSaving: boolean
  fileMoving: boolean
  handleCreateFile: () => Promise<void>
  handleUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  handleUploadFiles: (files: File[]) => Promise<void>
  handleSelectFile: (f: SkillFileItem) => Promise<void>
  handleDeleteFile: (path: string) => Promise<void>
  handleMoveFile: (fromPath: string, toPath: string) => Promise<void>
  handleSaveFile: () => Promise<void>
  setFileContent: (value: string) => void
}

export function SkillFormFilesTab({
  skillId,
  roundedClass,
  roundedLgClass,
  ALLOWED_DIRS,
  files,
  selectedFile,
  fileContent,
  newFileDir,
  setNewFileDir,
  newFileName,
  setNewFileName,
  fileSaving,
  fileMoving,
  handleCreateFile,
  handleUploadFile,
  handleUploadFiles,
  handleSelectFile,
  handleDeleteFile,
  handleMoveFile,
  handleSaveFile,
  setFileContent,
}: FilesTabProps) {
  const initialDirAndName = (() => {
    if (!selectedFile) return { dir: ALLOWED_DIRS[0] || 'references', name: '' }
    const [dir, ...rest] = selectedFile.path.split('/')
    return {
      dir: ALLOWED_DIRS.includes(dir) ? dir : (ALLOWED_DIRS[0] || 'references'),
      name: rest.join('/'),
    }
  })()
  const [moveDir, setMoveDir] = useState(initialDirAndName.dir)
  const [moveName, setMoveName] = useState(initialDirAndName.name)
  const [dragging, setDragging] = useState(false)

  const moveTargetPath = useMemo(
    () => `${moveDir}/${moveName.trim()}`,
    [moveDir, moveName],
  )

  if (!skillId) {
    return <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>请先保存 Skill 以管理支持文件。</p>
  }

  return (
    <>
      <div className="flex gap-2 items-end">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>目录</label>
          <Select value={newFileDir} onValueChange={setNewFileDir}>
            <SelectTrigger className={`${roundedClass} h-9 w-[140px] border-[var(--input-border)] bg-[var(--input-bg)]`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
              {ALLOWED_DIRS.map((d) => (
                <SelectItem key={d} value={d}>{d}/</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>文件名</label>
          <Input value={newFileName} density="compact" onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void handleCreateFile())} className={`w-full ${roundedClass}`} placeholder="例如 rules.md" />
        </div>
        <Button onClick={() => void handleCreateFile()} type="button" disabled={fileSaving || !newFileName.trim()} size="sm" className={`${roundedLgClass} px-3`}>
          <Plus className="inline h-4 w-4 mr-1" />创建
        </Button>
        <label className={`cursor-pointer ${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <Upload className="inline h-4 w-4 mr-1" />上传
          <input type="file" multiple className="hidden" onChange={(e) => void handleUploadFile(e)} />
        </label>
      </div>

      <div
        className={`${roundedClass} border border-dashed px-4 py-3 text-sm transition-colors`}
        style={{
          borderColor: dragging ? 'var(--accent)' : 'var(--border)',
          background: dragging ? 'color-mix(in srgb, var(--accent) 10%, var(--card))' : 'var(--card)',
          color: 'var(--muted-foreground)',
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const droppedFiles = Array.from(e.dataTransfer.files || [])
          if (droppedFiles.length > 0) void handleUploadFiles(droppedFiles)
        }}
      >
        拖拽文件到此处即可上传（默认放入 assets/ 目录）
      </div>

      <div className="flex gap-4 min-h-[300px]">
        <div className={`w-1/3 ${roundedClass} border p-2 overflow-auto`}>
          {ALLOWED_DIRS.map((dir) => {
            const dirFiles = files.filter((f) => f.path.startsWith(dir + '/'))
            if (dirFiles.length === 0) return null
            return (
              <div key={dir} className="mb-3">
                <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>{dir}/</p>
                {dirFiles.map((f) => (
                  <div key={f.path} className={`flex items-center justify-between ${roundedClass} px-2 py-1 text-sm cursor-pointer transition-colors`} style={{ background: selectedFile?.path === f.path ? 'var(--muted)' : 'transparent' }}>
                    <Button
                      onClick={() => {
                        const [dir, ...rest] = f.path.split('/')
                        if (ALLOWED_DIRS.includes(dir)) setMoveDir(dir)
                        setMoveName(rest.join('/'))
                        void handleSelectFile(f)
                      }}
                      type="button"
                      variant="ghost"
                      className="h-auto flex items-center gap-1 truncate flex-1 justify-start px-1 py-0.5 text-left"
                    >
                      <FileIcon className="h-3 w-3 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                      <span className="truncate">{f.path.split('/').slice(1).join('/')}</span>
                    </Button>
                    <Button onClick={() => void handleDeleteFile(f.path)} type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-1 text-[var(--danger)] opacity-40 hover:opacity-100">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          })}
          {files.length === 0 && <p className="text-xs p-2" style={{ color: 'var(--muted-foreground)' }}>暂无文件</p>}
        </div>

        <div className={`flex-1 ${roundedClass} border p-2`}>
          {selectedFile ? (
            <div className="flex h-full flex-col gap-3">
              <div className={`${roundedClass} border p-2`}>
                <p className="mb-2 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>
                  当前路径：{selectedFile.path}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>移动到</label>
                    <Select value={moveDir} onValueChange={setMoveDir}>
                      <SelectTrigger className={`${roundedClass} h-8 w-[140px] border-[var(--input-border)] bg-[var(--input-bg)]`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
                        {ALLOWED_DIRS.map((d) => (
                          <SelectItem key={d} value={d}>{d}/</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>新文件名</label>
                    <Input
                      value={moveName}
                      density="compact"
                      onChange={(e) => setMoveName(e.target.value)}
                      className={`w-full ${roundedClass}`}
                      placeholder="例如 rules-v2.md"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`${roundedClass} h-8 px-3 text-xs`}
                    disabled={fileMoving || !moveName.trim() || moveTargetPath === selectedFile.path}
                    onClick={() => void handleMoveFile(selectedFile.path, moveTargetPath)}
                  >
                    <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                    {fileMoving ? '处理中...' : '重命名/移动'}
                  </Button>
                </div>
              </div>

              {selectedFile.isBinary ? (
                <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>
                  二进制文件：{selectedFile.path} ({selectedFile.mime})
                </p>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{selectedFile.path}</span>
                    <Button onClick={() => void handleSaveFile()} type="button" disabled={fileSaving} size="sm" className={`${roundedClass} h-7 px-3 text-xs`}>
                      {fileSaving ? '保存中...' : '保存'}
                    </Button>
                  </div>
                  <Textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} className="flex-1 w-full rounded min-h-[250px] font-mono resize-none" />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>选择文件进行编辑</p>
          )}
        </div>
      </div>
    </>
  )
}
