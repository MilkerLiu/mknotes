import * as vscode from 'vscode';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';
import * as path from 'path';
import { basename } from 'path';

export namespace _ {

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
            const targetPath = path.join(targetDir, path.parse(src).base);
            if (fs.existsSync(targetPath)) {
                resolve();
            } else {
                fs.rename(src, targetPath, error => handleResult(resolve, reject, error, void 0));
            }
        });
    }

    export function copy(src: string, targetDir: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const targetPath = path.join(targetDir, path.parse(src).base);
            if (fs.existsSync(targetPath)) {
                resolve();
            } else {
                fs.copyFile(src, targetPath, error => handleResult(resolve, reject, error, void 0));
            }
        });
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

export interface Entry {
    uri: vscode.Uri;
    name: string;
    stat: FileStat;
    type: vscode.FileType;
}

//#endregion

export const IGNORES = [
    '.git',
    '.DS_Store',
    '.sort',
    '.favourite',
];

export namespace FM {
    async function _sorts(dir: string) {
        const p = path.join(dir, '.sort');
        try {
            if (await _.exists(p)) {
                return (await _.readfile(p)).toString().split('\n');
            }
            return [];
        } catch {
            return [];
        }
    }

    export async function exists(path: string) {
        return _.exists(path);
    }

    export async function write(path: string, content: string) {
        return _.writefile(path, Buffer.from(content));
    }

    export async function rename(p1: string, p2: string) {
        return _.rename(p1, p2);
    }

    export async function mkdir(dir: string) {
        return _.mkdir(dir);
    }

    export async function rmrf(path: string) {
        return _.rmrf(path);
    }

    export async function copy(src: string, dest: string) {
        return _.copy(src, dest);
    }

    export async function move(src: string, dest: string) {
        return _.move(src, dest);
    }

    export async function stat(p: string) {
        return new FileStat(await _.stat(p));
    }

    export async function listDir(dir: string) {
        const children = await _.readdir(dir);
        var res = [];
        for (var i = 0; i < children.length; i++) {
            var p = path.join(dir, children[i]);
            var _stat = await stat(p);
            res.push({
                name: children[i],
                uri: vscode.Uri.file(p),
                stat: _stat,
                type: _stat.type,
            } as Entry);
        }
        return await sorts(dir, res);
    }

    async function sorts(dir: string, items: Entry[]) {
        const sorts = await _sorts(dir);
        return items
            .filter(e => IGNORES.indexOf(e.name) < 0)
            .sort((e1, e2) => {
                var ai = sorts.indexOf(e1.name);
                var bi = sorts.indexOf(e2.name);
                if (ai >= 0 && bi >= 0) {
                    return ai > bi ? 1 : -1;
                } else if (ai >= 0 || bi >= 0) {
                    return ai > bi ? -1 : 1;
                } else {
                    if (e1.stat.type === e2.stat.type) {
                        return e1.name.localeCompare(e2.name);
                    }
                    return e1.stat.type === vscode.FileType.Directory ? -1 : 1;
                }
            });
    }
}

async function sortRules(dir: string) {
    try {
        const res = await _.readfile(path.join(dir, '.sort'));
        return res.toString().split("\n");
    } catch {
        return [];
    }
}

export async function parseTreeList(dir: string, children: [string, vscode.FileType][]) {
    const sorts = await sortRules(dir);
    return children
        .filter(([name, type]) => IGNORES.indexOf(name) < 0)
        .sort(([an, at], [bn, bt]) => {
            var ai = sorts.indexOf(an);
            var bi = sorts.indexOf(bn);
            if (ai >= 0 && bi >= 0) {
                return ai > bi ? 1 : -1;
            } else if (ai >= 0 || bi >= 0) {
                return ai > bi ? -1 : 1;
            } else {
                if (at === bt) {
                    return an.localeCompare(bn);
                }
                return at === vscode.FileType.Directory ? -1 : 1;
            }
        })
        .map(([name, type]) => ({ uri: vscode.Uri.file(path.join(dir, name)), type }));
}

export async function stat(path: string): Promise<vscode.FileStat> {
    return new FileStat(await _.stat(path));
}

async function _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const children = await _.readdir(uri.fsPath);
    const result: [string, vscode.FileType][] = [];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const _stat = await stat(path.join(uri.fsPath, child));
        result.push([child, _stat.type]);
    }
    return Promise.resolve(result);
}

export async function readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    return _readDirectory(uri);
}