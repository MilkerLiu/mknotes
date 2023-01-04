/* eslint-disable @typescript-eslint/naming-convention */
/**
 * 封装一些常用的工具函数
 */
import * as vscode from 'vscode';

export class Service {
    static instance: Service;
    static context: vscode.ExtensionContext;
    static viewId: string;
    static setup(context: vscode.ExtensionContext) {
        this.instance = new this(context);
        this.context = context;
    }
    protected constructor(context: vscode.ExtensionContext) {
    }

    protected setContext(key: string, value: any) {
        vscode.commands.executeCommand('setContext', key, value);
    }
    protected getContext(key: string) {
        return vscode.commands.executeCommand('getContext', key);
    }
}

/**
 * register a commnad bind a target functions
 * like @Command("xxx.action")
 * @param cmd the command
 * @param useContext make command in context
 * @returns 
 */
export function Command(cmd: string, useContext?: boolean): any {
    return function (target: any, methodName: string, descriptor: PropertyDescriptor) {
        const originMethod = descriptor.value;
        const dis = vscode.commands.registerCommand(cmd, (...args: any) => {
            originMethod.call(target.constructor.instance, args);
        });
        if (useContext) {
            target.constructor.context.push(dis);
        }
        return descriptor;
    };
}

export type IRunLoading = vscode.ProgressOptions;

export function RunLoading(opt?: IRunLoading): any {
    return function (target: any, methodName: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function (...args: any[]) {
            vscode.window.withProgress({
                location: { viewId: target.constructor.viewId },
                ...(opt ?? {})
            }, (progress, token) => {
                return originalMethod.call(this, ...args);
            });
        };
        return descriptor;
    };
}