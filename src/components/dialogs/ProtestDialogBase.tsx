import * as React from "react";
import { Dialog, DialogFooter, IDialogContentProps, DialogType } from "@fluentui/react/lib/Dialog";
import { IModalProps } from "@fluentui/react/lib/Modal";
import { ContextualMenu } from "@fluentui/react/lib/ContextualMenu";
import { PrimaryButton, DefaultButton } from "@fluentui/react/lib/Button";

import { TextField } from "@fluentui/react/lib/TextField";
import { AppState } from "src/state/AppState";

const content: IDialogContentProps = {
    type: DialogType.normal,
    title: "Add Protest",
    closeButtonAriaLabel: "Close",
    showCloseButton: true,
};

const modalProps: IModalProps = {
    isBlocking: false,
    dragOptions: {
        moveMenuItemText: "Move",
        closeMenuItemText: "Close",
        menu: ContextualMenu,
    },
};

export const ProtestDialogBase = (props: React.PropsWithChildren<IProtestDialogBaseProps>): JSX.Element => {
    const changeHandler = React.useCallback(
        (ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) =>
            props.appState.uiState.updatePendingProtestReason(newValue ?? ""),
        [props]
    );
    const submitHandler = React.useCallback(() => onSubmit(props), [props]);
    const cancelHandler = React.useCallback(() => onCancel(props), [props]);

    return (
        <Dialog hidden={props.hidden} dialogContentProps={content} modalProps={modalProps} onDismiss={cancelHandler}>
            {props.children}
            <TextField
                label="Reason for the protest"
                value={props.reason}
                multiline={true}
                onChange={changeHandler}
                autoFocus={props.autoFocusOnReason}
            />
            <DialogFooter>
                <PrimaryButton text="OK" onClick={submitHandler} />
                <DefaultButton text="Cancel" onClick={cancelHandler} />
            </DialogFooter>
        </Dialog>
    );
};

function onSubmit(props: IProtestDialogBaseProps): void {
    props.onSubmit();
    props.hideDialog();
}

function onCancel(props: IProtestDialogBaseProps): void {
    props.hideDialog();
}

export interface IProtestDialogBaseProps {
    appState: AppState;
    autoFocusOnReason?: boolean;
    hidden: boolean;
    reason: string;

    hideDialog: () => void;
    onSubmit: () => void;
}
