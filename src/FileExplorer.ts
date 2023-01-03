import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';
import Dialog from './utils/alert';
import Config from './utils/config';
import { Command, Service, RunLoading } from './utils/services';
import open = require('open');

namespace _ {

    function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
        if (error) {
            reject(massageError(error));
        } else {
            resolve(result);
        }
    }

    function massageError(error: Error & { code?: string }): Error {
        if (error.code === 'ENOENT') {
            return vscode.FileSystemError.FileNotFound();
        }

        if (error.code === 'EISDIR') {
            return vscode.FileSystemError.FileIsADirectory();
        }

        if (error.code === 'EEXIST') {
            return vscode.FileSystemError.FileExists();
        }

        if (error.code === 'EPERM' || error.code === 'EACCESS') {
            return vscode.FileSystemError.NoPermissions();
        }

        return error;
    }

    export function checkCancellation(token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            throw new Error('Operation cancelled');
        }
    }

    export function normalizeNFC(items: string): string;
    export function normalizeNFC(items: string[]): string[];
    export function normalizeNFC(items: string | string[]): string | string[] {
        if (process.platform !== 'darwin') {
            return items;
        }

        if (Array.isArray(items)) {
            return items.map(item => item.normalize('NFC'));
        }

        return items.normalize('NFC');
    }

    export function readdir(path: string): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
        });
    }

    export function stat(path: string): Promise<fs.Stats> {
        return new Promise<fs.Stats>((resolve, reject) => {
            fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
        });
    }

    export function readfile(path: string): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
        });
    }

    export function writefile(path: string, content: Buffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
        });
    }

    export function exists(path: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            fs.exists(path, exists => handleResult(resolve, reject, null, exists));
        });
    }

    export function rmrf(path: string): Promise<void> {
        console.log(path)
        return new Promise<void>((resolve, reject) => {
            rimraf(path, error => handleResult(resolve, reject, error, void 0));
        });
    }

    export function mkdir(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            mkdirp(path, error => handleResult(resolve, reject, error, void 0));
        });
    }

    export function rename(oldPath: string, newPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
        });
    }

    export function unlink(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
        });
    }

    export function move(src: string, targetDir: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const targetPath = path.join(targetDir, path.parse(src).base)
            if (fs.existsSync(targetPath)) {
                resolve()
            } else {
                fs.rename(src, targetPath, error => handleResult(resolve, reject, error, void 0));
            }
        })
    }

    export function copy(src: string, targetDir: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const targetPath = path.join(targetDir, path.parse(src).base)
            if (fs.existsSync(targetPath)) {
                resolve()
            } else {
                fs.copyFile(src, targetPath, error => handleResult(resolve, reject, error, void 0));
            }
        })
    }
}

export class FileStat implements vscode.FileStat {

    constructor(private fsStat: fs.Stats) { }

    get type(): vscode.FileType {
        return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
    }

    get isFile(): boolean | undefined {
        return this.fsStat.isFile();
    }

    get isDirectory(): boolean | undefined {
        return this.fsStat.isDirectory();
    }

    get isSymbolicLink(): boolean | undefined {
        return this.fsStat.isSymbolicLink();
    }

    get size(): number {
        return this.fsStat.size;
    }

    get ctime(): number {
        return this.fsStat.ctime.getTime();
    }

    get mtime(): number {
        return this.fsStat.mtime.getTime();
    }
}

interface Entry {
    uri: vscode.Uri;
    type: vscode.FileType;
}

//#endregion

const IGNORES = [
    '.git',
    '.DS_Store'
]

export default class FileExplorer extends Service implements
    vscode.TreeDataProvider<Entry>,
    vscode.TreeDragAndDropController<Entry> {

    treeView: vscode.TreeView<Entry>

    private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined> = new vscode.EventEmitter<Entry | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Entry | undefined> = this._onDidChangeTreeData.event;

    static get mimeKey() { return `application/vnd.code.tree.${this.viewId}` }

    dropMimeTypes = [FileExplorer.mimeKey];
    dragMimeTypes = ['text/uri-list'];

    protected constructor(context: vscode.ExtensionContext) {
        super(context)
        FileExplorer.viewId = 'fileExplorer'
        this.setContext('location', Config.location)
        this.treeView = vscode.window.createTreeView(FileExplorer.viewId, {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: true,
            dragAndDropController: this
        })
    }

    get currentItem() {
        if (this.treeView.selection.length > 0) {
            return this.treeView.selection.at(this.treeView.selection.length - 1)
        }
        return undefined
    }

    get currentItemParentDir() {
        let currentItem = this.currentItem
        if (currentItem) {
            return vscode.Uri.joinPath(currentItem.uri, '..')
        }
        return vscode.Uri.file(Config.location)
    }

    get currentDir() {
        let currentItem = this.currentItem
        if (!currentItem) {
            return vscode.Uri.file(Config.location)
        } else if (currentItem?.type == vscode.FileType.Directory) {
            return currentItem.uri
        } else {
            return vscode.Uri.joinPath(currentItem.uri, '..')
        }
    }

    private async checkExist(fileUri: vscode.Uri) {
        if (await _.exists(fileUri.path)) {
            throw "A note with that name already exists."
        }
        return fileUri
    }

    async _stat(path: string): Promise<vscode.FileStat> {
        return new FileStat(await _.stat(path));
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return this._readDirectory(uri);
    }

    async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const children = await _.readdir(uri.fsPath);
        const result: [string, vscode.FileType][] = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const stat = await this._stat(path.join(uri.fsPath, child));
            result.push([child, stat.type]);
        }
        return Promise.resolve(result);
    }

    // DRAG PROVIDER
    handleDrag?(source: readonly Entry[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        dataTransfer.set(FileExplorer.viewId, new vscode.DataTransferItem(source));
    }

    handleDrop?(target: Entry | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const transferItem = dataTransfer.get(FileExplorer.viewId)
        this.move(target, transferItem?.value as Entry[] ?? [])
    }

    // TREE PROVIDER
    async getChildren(element?: Entry): Promise<Entry[]> {
        if (element) {
            const children = await this.readDirectory(element.uri);
            return children.filter(([name, type]) => IGNORES.indexOf(name) < 0).map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
        }
        const dir: string = vscode.workspace.getConfiguration('mknote').get('location') ?? ""
        if (dir.length == 0) return []
        const workspaceUri = vscode.Uri.file(dir)
        const children = await this.readDirectory(workspaceUri);
        children.sort((a, b) => {
            if (a[1] === b[1]) {
                return a[0].localeCompare(b[0]);
            }
            return a[1] === vscode.FileType.Directory ? -1 : 1;
        });
        return children.filter(([name, type]) => IGNORES.indexOf(name) < 0).map(([name, type]) => ({ uri: vscode.Uri.file(path.join(workspaceUri.fsPath, name)), type }));
    }

    getTreeItem(element: Entry): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ?
            vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'mknote.openFile', title: "Open File", arguments: [element.uri], };
            treeItem.contextValue = 'file';
        }
        return treeItem;
    }

    // COMMADS

    @Command("mknote.setFolder")
    setupFolder() {
        Dialog.chooseFolder()
            .then(location => Config.updateLocation(location))
            .then(() => Dialog.showWarningMessage(`You must reload the window for the storage location change to take effect.`))
            .then(res => res == 'Yes' && vscode.commands.executeCommand('workbench.action.reloadWindow'))
    }

    @Command("mknote.refresh")
    refresh() {
        this._onDidChangeTreeData.fire(undefined)
    }

    @Command('mknote.openFile')
    openFile(resource: vscode.Uri[]): void {
        vscode.commands.executeCommand('vscode.open', resource[0])
    }

    @Command('mknote.revealInFinder')
    revealInFinder(resource: Entry[]): void {
        if (!resource || resource.length == 0) return
        let res = resource[0]
        if (res.type == vscode.FileType.Directory) {
            open(resource[0].uri.path)
        } else {
            open(path.resolve(resource[0].uri.path, '..'))
        }
    }

    @Command("mknote.newItem")
    newItem() {
        Dialog.showInputBox("File Name")
            .then(name => vscode.Uri.joinPath(this.currentDir, name))
            .then(uri => this.checkExist(uri))
            .then(fileUri => _.writefile(fileUri.path, Buffer.alloc(0)).then(() => fileUri))
            .then(fileUri => this.openFile([fileUri]))
            .then(() => vscode.commands.executeCommand('cursorMove', { 'to': 'viewPortBottom' }))
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh())
    }

    @Command("mknote.newGroup")
    newGroup() {
        Dialog.showInputBox("Group Name")
            .then(name => vscode.Uri.joinPath(this.currentDir, name))
            .then(uri => this.checkExist(uri))
            .then(groupUri => {
                return _.mkdir(groupUri.path)
            })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh())
    }

    @Command("mknote.renameItem")
    renameItem() {
        if (!this.currentItem) {
            return
        }
        const oldPath = this.currentItem.uri.path
        const oldName = path.parse(oldPath).base
        Dialog.showInputBox("New Name", oldName)
            .then(name => vscode.Uri.joinPath(this.currentItemParentDir, name))
            .then(uri => this.checkExist(uri))
            .then(fileUri => {
                return _.rename(oldPath, fileUri.path)
            })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh())
    }

    @Command("mknote.deleteItem")
    deleteItem() {
        const files = this.treeView.selection
        if (files.length == 0) {
            return
        }
        const allFiles = files.map(e => path.parse(e.uri.path).base).join("\n")
        Dialog.showWarningMessage(`Are you sure you want to delete '${allFiles}'?`)
            .then(res => {
                if (res === 'Yes') {
                    return Promise.all(files.map(e => _.rmrf(e.uri.path))).then(() => true)
                }
                return false
            })
            .then(code => { code && vscode.window.showInformationMessage(`Successfully deleted ${allFiles}.`) })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh())
    }

    @RunLoading()
    move(target: Entry | undefined, sources: Entry[]) {
        target = target ?? {
            uri: vscode.Uri.file(Config.location),
            type: vscode.FileType.Directory
        } as Entry
        const targetDir = target?.type == vscode.FileType.Directory ? target.uri : vscode.Uri.joinPath(target?.uri!, "..")
        return Promise.all(sources.map(e => _.move(e.uri.path, targetDir.path))).then(() => this.refresh())
    }
    @RunLoading()
    copy(target: Entry | undefined, sources: Entry[]) {
        target = target ?? {
            uri: vscode.Uri.file(Config.location),
            type: vscode.FileType.Directory
        } as Entry
        const targetDir = target?.type == vscode.FileType.Directory ? target.uri : vscode.Uri.joinPath(target?.uri!, "..")
        return Promise.all(sources.map(e => _.copy(e.uri.path, targetDir.path))).then(() => this.refresh())
    }

    isCopy = false
    _selectedFiles: Entry[] = []
    get selectedFiles() { return this._selectedFiles }
    set selectedFiles(v: Entry[]) { this._selectedFiles = v; this.setContext('sel_files', this._selectedFiles.length > 0) }

    @Command('mknote.copy')
    async c_copy() {
        this.selectedFiles = [...this.treeView.selection]
        this.isCopy = true
    }
    @Command('mknote.cut')
    async c_cut() {
        this.isCopy = false
        this.selectedFiles = [...this.treeView.selection]
    }

    @Command('mknote.paste')
    async c_paste() {
        if (this.selectedFiles.length == 0) return
        if (this.isCopy) {
            await this.copy(this.currentItem, this.selectedFiles)
        } else {
            await this.move(this.currentItem, this.selectedFiles)
        }
        this.isCopy = false
        this.selectedFiles = []
    }


    @Command('mknote.newWindow')
    openInNewWindow() {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(Config.location))
    }

}