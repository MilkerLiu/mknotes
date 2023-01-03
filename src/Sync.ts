import * as vscode from 'vscode';
import { API, GitExtension } from './utils/git';
import Config from './utils/config';
import Dialog from './utils/alert';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Command, RunLoading, Service } from './utils/services';

const _exec = promisify(exec)

export default class Sync extends Service {
    gitExtension: GitExtension

    protected constructor(context: vscode.ExtensionContext) {
        super(context)
        Sync.viewId = 'fileExplorer'
        this.gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
    }

    private get git(): API {
        return this.gitExtension.getAPI(1)
    }

    private gitRemote() {
        return this.gitRepo()
            .then(re => {
                const remotes = re?.state.remotes.filter(r => r.name == 'origin')
                if (remotes && remotes.length > 0) return remotes[0]
                return undefined
            })
    }

    private gitRepo() {
        return this.git.init(vscode.Uri.file(Config.location))
    }

    // Command
    @Command("mknote.repo.setup")
    async repoSetup() {
        try {

            const repoUri = await Dialog.showInputBox('Git Repo')
            const folder = await Dialog.chooseFolder()

            const location = path.join(folder, 'notes')

            await _exec(`git clone ${repoUri} ${location}`)

            await Config.updateLocation(location)

            vscode.commands.executeCommand('workbench.action.reloadWindow');

        } catch (error) {
            vscode.window.showErrorMessage(`${error}`)
        }
    }

    @Command("mknote.repo.sync")
    @RunLoading()
    async repoSync() {
        try {
            const repo = await this.git.openRepository(vscode.Uri.file(Config.location))
            if (!repo) {
                throw "Please init your folder with git"
            }
            const origin = await this.gitRemote()
            if (!origin) {
                throw 'Please setup your git-repo with remote'
            }

            const branch = repo?.state.HEAD
            if (!branch?.upstream) {
                throw 'Please setup your branch with upstream'
            }

            if (repo?.state.workingTreeChanges.length) {
                await repo?.add([Config.location])
                await repo?.commit((new Date()).toLocaleString())
            }
            await repo?.pull()
            await repo?.push('origin')

            vscode.window.showInformationMessage(`Successfully`)

        } catch (error) {
            console.log(error)
            vscode.window.showErrorMessage(`${error}`)
        }
    }
}