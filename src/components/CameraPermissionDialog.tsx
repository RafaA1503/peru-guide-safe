
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Shield } from 'lucide-react';

interface CameraPermissionDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onDeny: () => void;
}

const CameraPermissionDialog: React.FC<CameraPermissionDialogProps> = ({
  isOpen,
  onAccept,
  onDeny
}) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md mx-4">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Camera className="h-10 w-10 text-primary" />
          </div>
          <DialogTitle className="text-xl font-semibold">
            Activar Cámara
          </DialogTitle>
          <DialogDescription className="text-base">
            Para poder asistirle en la navegación, necesitamos acceso a la cámara de su dispositivo.
            Esto nos permitirá detectar obstáculos y peligros en tiempo real.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
          <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Su privacidad es importante. Las imágenes se procesan de forma segura y no se almacenan.
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-6">
          <Button
            onClick={onAccept}
            className="w-full h-12 text-lg font-medium bg-primary hover:bg-primary/90"
          >
            <Camera className="w-5 h-5 mr-2" />
            Activar Cámara
          </Button>
          <Button
            onClick={onDeny}
            variant="outline"
            className="w-full h-12 text-lg"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraPermissionDialog;
