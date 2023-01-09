/* eslint-disable no-throw-literal */
import * as vscode from 'vscode';
import * as path from 'path';
import Dialog from './utils/alert';
import Config from './utils/config';
import { Command, Service, RunLoading } from './utils/services';
import open = require('open');
import { Entry, FM } from './file';

export default class FileExplorer extends Service implements
    vscode.TreeDataProvider<Entry>,
    vscode.TreeDragAndDropController<Entry> {

    treeView: vscode.TreeView<Entry>;

    private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined> = new vscode.EventEmitter<Entry | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Entry | undefined> = this._onDidChangeTreeData.event;

    static get mimeKey() { return `application/vnd.code.tree.${this.viewId}`; }

    dropMimeTypes = [FileExplorer.mimeKey];
    dragMimeTypes = ['text/uri-list'];

    protected constructor(context: vscode.ExtensionContext) {
        super(context);
        FileExplorer.viewId = 'notes';
        this.setContext('location', Config.location);
        this.treeView = vscode.window.createTreeView(FileExplorer.viewId, {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: true,
            dragAndDropController: this
        });
    }

    get currentItem() {
        if (this.treeView.selection.length > 0) {
            return this.treeView.selection.at(this.treeView.selection.length - 1);
        }
        return undefined;
    }

    get currentItemParentDir() {
        let currentItem = this.currentItem;
        if (currentItem) {
            return vscode.Uri.joinPath(currentItem.uri, '..');
        }
        return vscode.Uri.file(Config.location);
    }

    get currentDir() {
        let currentItem = this.currentItem;
        if (!currentItem) {
            return vscode.Uri.file(Config.location);
        } else if (currentItem?.type === vscode.FileType.Directory) {
            return currentItem.uri;
        } else {
            return vscode.Uri.joinPath(currentItem.uri, '..');
        }
    }

    private async checkExist(fileUri: vscode.Uri) {
        if (await FM.exists(fileUri.path)) {
            throw "A note with that name already exists.";
        }
        return fileUri;
    }

    // DRAG PROVIDER
    handleDrag?(source: readonly Entry[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        dataTransfer.set(FileExplorer.viewId, new vscode.DataTransferItem(source));
    }

    handleDrop?(target: Entry | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const transferItem = dataTransfer.get(FileExplorer.viewId);
        this.move(target, transferItem?.value as Entry[] ?? []);
    }

    // TREE PROVIDER
    async getChildren(element?: Entry): Promise<Entry[]> {
        var uri = element ? element.uri : vscode.Uri.file(Config.location);
        if (uri.fsPath.length === 0) { return []; }
        return FM.listDir(uri.fsPath);
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
            .then(res => res === 'Yes' && vscode.commands.executeCommand('workbench.action.reloadWindow'));
    }

    @Command("mknote.notes.refresh")
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

    @Command('mknote.openFile')
    openFile(resource: vscode.Uri[]): void {
        vscode.commands.executeCommand('vscode.open', resource[0]);
    }

    @Command('mknote.revealInFinder')
    revealInFinder(resource: Entry[]): void {
        if (!resource || resource.length === 0) { return; };
        let res = resource[0];
        if (res.type === vscode.FileType.Directory) {
            open(resource[0].uri.path);
        } else {
            open(path.resolve(resource[0].uri.path, '..'));
        }
    }

    @Command("mknote.notes.newItem")
    newItem() {
        Dialog.showInputBox("File Name")
            .then(name => vscode.Uri.joinPath(this.currentDir, name))
            .then(uri => this.checkExist(uri))
            .then(fileUri => FM.write(fileUri.path, "").then(() => fileUri))
            .then(fileUri => this.openFile([fileUri]))
            .then(() => vscode.commands.executeCommand('cursorMove', { 'to': 'viewPortBottom' }))
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh());
    }

    @Command("mknote.notes.newGroup")
    newGroup() {
        Dialog.showInputBox("Group Name")
            .then(name => vscode.Uri.joinPath(this.currentDir, name))
            .then(uri => this.checkExist(uri))
            .then(groupUri => {
                return FM.mkdir(groupUri.path);
            })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh());
    }

    @Command("mknote.notes.renameItem")
    renameItem() {
        if (!this.currentItem) {
            return;
        }
        const oldPath = this.currentItem.uri.path;
        const oldName = path.parse(oldPath).base;
        Dialog.showInputBox("New Name", oldName)
            .then(name => vscode.Uri.joinPath(this.currentItemParentDir, name))
            .then(uri => this.checkExist(uri))
            .then(fileUri => {
                return FM.rename(oldPath, fileUri.path);
            })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh());
    }

    @Command("mknote.notes.deleteItem")
    deleteItem() {
        const files = this.treeView.selection;
        if (files.length === 0) {
            return;
        }
        const allFiles = files.map(e => path.parse(e.uri.path).base).join("\n");
        Dialog.showWarningMessage(`Are you sure you want to delete '${allFiles}'?`)
            .then(res => {
                if (res === 'Yes') {
                    return Promise.all(files.map(e => FM.rmrf(e.uri.path))).then(() => true);
                }
                return false;
            })
            .then(code => { code && vscode.window.showInformationMessage(`Successfully deleted ${allFiles}.`); })
            .catch(err => Dialog.showErrorMessage(err))
            .finally(() => this.refresh());
    }

    @RunLoading()
    move(target: Entry | undefined, sources: Entry[]) {
        target = target ?? {
            uri: vscode.Uri.file(Config.location),
            type: vscode.FileType.Directory
        } as Entry;
        const targetDir = target?.type === vscode.FileType.Directory ? target.uri : vscode.Uri.joinPath(target?.uri!, "..");
        return Promise.all(sources.map(e => FM.move(e.uri.path, targetDir.path))).then(() => this.refresh());
    }

    @RunLoading()
    copy(target: Entry | undefined, sources: Entry[]) {
        target = target ?? {
            uri: vscode.Uri.file(Config.location),
            type: vscode.FileType.Directory
        } as Entry;
        const targetDir = target?.type === vscode.FileType.Directory ? target.uri : vscode.Uri.joinPath(target?.uri!, "..");
        return Promise.all(sources.map(e => FM.copy(e.uri.path, targetDir.path))).then(() => this.refresh());
    }

    isCopy = false;
    _selectedFiles: Entry[] = [];
    get selectedFiles() { return this._selectedFiles; }
    set selectedFiles(v: Entry[]) { this._selectedFiles = v; this.setContext('sel_files', this._selectedFiles.length > 0); }

    @Command('mknote.notes.copy')
    async cmdCopy() {
        this.selectedFiles = [...this.treeView.selection];
        this.isCopy = true;
    }
    @Command('mknote.notes.cut')
    async cmdCut() {
        this.isCopy = false;
        this.selectedFiles = [...this.treeView.selection];
    }

    @Command('mknote.notes.paste')
    async cmdPaste() {
        if (this.selectedFiles.length === 0) { return; };
        if (this.isCopy) {
            await this.copy(this.currentItem, this.selectedFiles);
        } else {
            await this.move(this.currentItem, this.selectedFiles);
        }
        this.isCopy = false;
        this.selectedFiles = [];
    }

    @Command('mknote.newWindow')
    openInNewWindow() {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(Config.location));
    }

    // MOVE
    @Command('mknote.notes.moveUp')
    async itemMoveUp(entrys: Entry[]) {
        const entry = entrys[0];
        const dir = path.parse(entry.uri.fsPath).dir;
        let children = await FM.listDir(dir);
        var index = children.findIndex(e => e.uri.fsPath === entry.uri.fsPath);
        if (index === 0) { return; }
        children[index] = children[index - 1];
        children[index - 1] = entry;
        var sorts = children.map(e => path.parse(e.uri.fsPath).base);
        await FM.write(path.join(dir, '.sort'), sorts.join('\n'));
        vscode.commands.executeCommand('mknote.notes.refresh');
    }

    @Command('mknote.notes.moveDown')
    async itemMoveDown(entrys: Entry[]) {
        const entry = entrys[0];
        const dir = path.parse(entry.uri.fsPath).dir;
        let children = await FM.listDir(dir);
        var index = children.findIndex(e => e.uri.fsPath === entry.uri.fsPath);
        if (index === children.length - 1) { return; }
        children[index] = children[index + 1];
        children[index + 1] = entry;
        var sorts = children.map(e => path.parse(e.uri.fsPath).base);
        await FM.write(path.join(dir, '.sort'), sorts.join('\n'));
        vscode.commands.executeCommand('mknote.notes.refresh');
    }

}