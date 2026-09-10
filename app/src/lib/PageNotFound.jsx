import React from 'react';
import { Link } from 'react-router-dom';
import { Car, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Car className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Cette page n'existe pas. Vous vous êtes peut-être trompé de route !
        </p>
        <Link to="/">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}