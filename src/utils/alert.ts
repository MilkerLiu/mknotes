import * as vscode from 'vscode';
import * as path from 'path';

export default class Dialog {
    
    static showInputBox(prompt: string, value?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: prompt,
                value: value ?? "",
            }).then(noteName => {
                if (noteName) resolve(noteName || "")
                else reject()
            }, reson => {
                reject()
            })
        })
    }

    static showWarningMessage(title: string) {
        return new Promise((resolve, reject) => {
            vscode.window.showWarningMessage(title, 'Yes', 'No').then(result => {
                resolve(result)
            })
        })
    }

    static showErrorMessage(err: any) {
        err && vscode.window.showErrorMessage(`${err}`)
    }

    static chooseFolder(): Promise<string> {
        let openDialogOptions: vscode.OpenDialogOptions = {
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select'
        };
        return new Promise((resolve, reject) => {
            vscode.window.showOpenDialog(openDialogOptions).then(fileUri => {
                if (fileUri && fileUri[0]) {
                    resolve(path.normalize(fileUri[0].fsPath))
                } else {
                    reject(undefined)
                }
            });
        })

    }
}