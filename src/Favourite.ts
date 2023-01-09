import { Command, Service } from './utils/services';
import * as vscode from 'vscode';
import { Entry, FM } from './file';
import * as path from 'path';
import Config from './utils/config';
import * as fs from 'fs';

export default class Favourite extends Service implements vscode.TreeDataProvider<Entry>{

    treeView: vscode.TreeView<Entry>;
    private _onDidChangeTreeData: vscode.EventEmitter<Entry | undefined> = new vscode.EventEmitter<Entry | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Entry | undefined> = this._onDidChangeTreeData.event;

    _favourites: string[] = [];

    protected constructor(context: vscode.ExtensionContext) {
        super(context);
        Favourite.viewId = 'favourite';
        this.treeView = vscode.window.createTreeView("favourite", {
            treeDataProvider: this,
            showCollapseAll: true,
            canSelectMany: true,
        });
        this._favourites = this.favourites();
    }

    getTreeItem(element: Entry): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ?
            vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'mknote.openFile', title: "Open File", arguments: [element.uri], };
            treeItem.contextValue = 'file';
        }
        treeItem.contextValue = path.parse(this.relativePath(element.uri.fsPath)).dir === '/' ? 'root' : 'child';
        return treeItem;
    }

    async getChildren(element?: Entry | undefined) {
        if (element === undefined) {
            return this.favouriteList();
        }
        var uri = element ? element.uri : vscode.Uri.file(Config.location ?? "");
        if (uri.fsPath.length === 0) { return []; }
        return FM.listDir(uri.fsPath);
    }

    check(children: string[]) {
        var ws = Config.location;
        return children.filter(e => e.trim() !== '' && fs.existsSync(path.join(ws, e)));
    }

    favourites() {
        var ws = Config.location;
        if (ws.length === 0) { return []; }
        var favouritePath = path.join(ws, '.favourite');
        if (!fs.existsSync(favouritePath)) { return []; }
        const res = fs.readFileSync(favouritePath).toString();
        return this.check(res.toString().split("\n"));
    }

    async saveFavourites(list: string[]) {
        var ws = Config.location;
        if (ws.length === 0) { return []; }
        var favouritePath = path.join(ws, '.favourite');
        FM.write(favouritePath, this.check(list).join("\n"));
    }

    async favouriteList(): Promise<Entry[]> {
        var uri = vscode.Uri.file(vscode.workspace.getConfiguration('mknote').get('location') ?? "");
        if (uri.fsPath.length === 0) { return []; }
        var favouritePath = path.join(uri.fsPath, '.favourite');
        if (!await FM.exists(favouritePath)) {
            return [];
        }
        try {
            var favourites = await this.favourites();
            var lists = [];
            for (var i = 0; i < favourites.length; i++) {
                try {
                    const child = favourites[i];
                    const p = path.join(uri.fsPath, child);
                    const _stat = await FM.stat(p);
                    lists.push({
                        name: child,
                        stat: _stat,
                        uri: vscode.Uri.file(p),
                        type: _stat.type
                    } as Entry);
                } catch {
                    continue;
                }
            }
            this.saveFavourites(favourites);
            return lists;
        } catch (e) {
            return [];
        }
    }

    relativePath(path: string) {
        return path.replace(Config.location, '');
    }

    @Command('mknote.fav.add')
    async cmdAdd(entries: Entry[]) {
        const entry = entries[0];
        const relativePath = this.relativePath(entry.uri.fsPath);
        let favourites = await this.favourites();
        if (favourites.indexOf(relativePath) >= 0) { return; }
        favourites.push(relativePath);
        this.saveFavourites(favourites);
        vscode.commands.executeCommand('mknote.fav.refresh');
    }

    @Command('mknote.fav.remove')
    async cmdRemove(entries: Entry[]) {
        const entry = entries[0];
        const relativePath = this.relativePath(entry.uri.fsPath);
        let favourites = await this.favourites();
        await this.saveFavourites(favourites.filter(e => relativePath !== e));
        vscode.commands.executeCommand('mknote.fav.refresh');
    }

    @Command('mknote.fav.moveUp')
    async cmdMoveUp(entries: Entry[]) {
        const entry = entries[0];
        const relativePath = this.relativePath(entry.uri.fsPath);
        let children = await this.favourites();
        var index = children.findIndex(e => e === relativePath);
        if (index === 0) { return; }
        children[index] = children[index - 1];
        children[index - 1] = relativePath;
        this.saveFavourites(children);
        vscode.commands.executeCommand('mknote.fav.refresh');
    }

    @Command('mknote.fav.moveDown')
    async cmdMoveDown(entries: Entry[]) {
        const entry = entries[0];
        const relativePath = this.relativePath(entry.uri.fsPath);
        let children = await this.favourites();
        var index = children.findIndex(e => e === relativePath);
        if (index === children.length - 1) { return; }
        children[index] = children[index + 1];
        children[index + 1] = relativePath;
        this.saveFavourites(children);
        vscode.commands.executeCommand('mknote.fav.refresh');
    }


    @Command('mknote.fav.refresh')
    async cmdRefresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
}